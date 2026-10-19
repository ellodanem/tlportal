import { Prisma, type SubscriptionCollectionHealth } from "@prisma/client";

import {
  canonicalBillingInterval,
  normalizeCurrency,
} from "./canonical-subscription-application";
import {
  canonicalManualPilotBillingAuthorized,
  type CanonicalManualPilotEnvironment,
} from "./canonical-manual-pilot";
import {
  canonicalSubscriptionOperationsEnabled,
  canonicalProductionManualScopeAuthorized,
  type CanonicalSubscriptionActivationEnvironment,
} from "./canonical-subscription-activation";

export const CANONICAL_NATIVE_BILLING_FLAG = "CANONICAL_NATIVE_BILLING_ENABLED";

export class CanonicalNativeBillingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalNativeBillingError";
    this.code = code;
  }
}

function billingError(code: string, message: string): never {
  throw new CanonicalNativeBillingError(code, message);
}

export type CanonicalNativeBillingEnvironment = CanonicalManualPilotEnvironment & CanonicalSubscriptionActivationEnvironment & {
  CANONICAL_NATIVE_BILLING_ENABLED?: string;
};

export type CanonicalNativeBillingExecutionScope = {
  customerId: string;
  subscriptionId: string;
  activationStatus: string | null;
  operationalActivationId?: string | null;
};

export function canonicalNativeBillingExecutionEnabled(
  environment: CanonicalNativeBillingEnvironment = process.env,
  scope?: CanonicalNativeBillingExecutionScope,
): boolean {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    return scope != null && (
      canonicalManualPilotBillingAuthorized({ ...scope, environment })
      || (canonicalSubscriptionOperationsEnabled(environment)
        && (Boolean(scope.operationalActivationId) || scope.activationStatus === "active"))
      || canonicalProductionManualScopeAuthorized({ scope, environment })
    );
  }
  return environment.CANONICAL_NATIVE_BILLING_ENABLED === "true";
}

export function assertCanonicalNativeBillingExecutionEnabled(
  environment: CanonicalNativeBillingEnvironment = process.env,
  scope?: CanonicalNativeBillingExecutionScope,
): void {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    if (!scope || (!canonicalManualPilotBillingAuthorized({ ...scope, environment })
      && !(canonicalSubscriptionOperationsEnabled(environment)
        && (Boolean(scope.operationalActivationId) || scope.activationStatus === "active"))
      && !canonicalProductionManualScopeAuthorized({ scope, environment }))) {
      billingError(
        "PRODUCTION_EXECUTION_DISABLED",
        "Canonical native billing is disabled in production unless a staff-approved operational activation owns this agreement.",
      );
    }
    return;
  }
  if (environment.CANONICAL_NATIVE_BILLING_ENABLED !== "true") {
    billingError(
      "FEATURE_DISABLED",
      `${CANONICAL_NATIVE_BILLING_FLAG}=true is required for local canonical billing execution.`,
    );
  }
}

export type CanonicalBillingRateInput = {
  id: string;
  billingIntervalMonths: number;
  agreedAmountPerCycle: Prisma.Decimal;
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  classification: "standard" | "negotiated";
};

export type CanonicalBillingItemInput = {
  id: string;
  label: string | null;
  status: "draft" | "pending_activation" | "active" | "paused" | "ended" | "canceled";
  billingEffectiveFrom: Date | null;
  billingEffectiveUntil: Date | null;
  rates: CanonicalBillingRateInput[];
};

export type CanonicalBillingConfigurationInput = {
  lifecycleStatus: "draft" | "pending_activation" | "active" | "paused" | "canceled" | "ended" | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  items: CanonicalBillingItemInput[];
};

export type CanonicalBillingCycleLine = {
  subscriptionItemId: string;
  subscriptionItemRateId: string;
  description: string;
  quantity: Prisma.Decimal;
  agreedAmountPerCycle: Prisma.Decimal;
  billedAmount: Prisma.Decimal;
  currency: string;
  classification: "standard" | "negotiated";
};

export type CanonicalBillingCycle = {
  billingIntervalMonths: 1 | 3 | 6 | 12;
  currency: string;
  periodStart: Date;
  lines: CanonicalBillingCycleLine[];
  subtotal: Prisma.Decimal;
};

function activeAt(date: Date, from: Date | null, until: Date | null): boolean {
  return from != null && from <= date && (until == null || date < until);
}

/** Resolve one contractual cycle using half-open [from, until) item and rate periods. */
export function resolveCanonicalBillingCycle(
  configuration: CanonicalBillingConfigurationInput,
  periodStart: Date,
  options: { requireActive?: boolean } = {},
): CanonicalBillingCycle {
  if (options.requireActive !== false && configuration.lifecycleStatus !== "active") {
    billingError("SUBSCRIPTION_NOT_ACTIVE", "Canonical billing requires an active commercial subscription.");
  }
  if (configuration.billingIntervalMonths == null || !configuration.currency) {
    billingError(
      "INCOMPLETE_COMMERCIAL_CONFIGURATION",
      "Billing interval and currency are required for canonical billing.",
    );
  }

  const billingIntervalMonths = canonicalBillingInterval(configuration.billingIntervalMonths);
  const currency = normalizeCurrency(configuration.currency);
  const eligibleItems = configuration.items.filter((item) => {
    const statusEligible = options.requireActive === false
      ? item.status !== "ended" && item.status !== "canceled"
      : item.status === "active";
    return statusEligible && activeAt(periodStart, item.billingEffectiveFrom, item.billingEffectiveUntil);
  });

  if (!eligibleItems.length) {
    billingError(
      "NO_BILLABLE_ITEMS",
      "No active subscription items are billable for this billing period.",
    );
  }

  const lines = eligibleItems.map<CanonicalBillingCycleLine>((item) => {
    const rates = item.rates.filter((rate) =>
      rate.billingIntervalMonths === billingIntervalMonths
      && normalizeCurrency(rate.currency) === currency
      && activeAt(periodStart, rate.effectiveFrom, rate.effectiveUntil));
    if (rates.length !== 1) {
      billingError(
        rates.length === 0 ? "ITEM_RATE_MISSING" : "ITEM_RATE_AMBIGUOUS",
        `${item.label?.trim() || `Subscription item ${item.id}`} must have exactly one effective ${billingIntervalMonths}-month ${currency} rate.`,
      );
    }
    const rate = rates[0];
    const amount = new Prisma.Decimal(rate.agreedAmountPerCycle).toDecimalPlaces(2);
    if (!amount.isFinite() || amount.isNegative()) {
      billingError("INVALID_ITEM_RATE", "Effective item rates must be non-negative finite amounts.");
    }
    return {
      subscriptionItemId: item.id,
      subscriptionItemRateId: rate.id,
      description: item.label?.trim() || "Tracking service",
      quantity: new Prisma.Decimal(1),
      agreedAmountPerCycle: amount,
      billedAmount: amount,
      currency,
      classification: rate.classification,
    };
  });

  const subtotal = lines.reduce(
    (total, line) => total.plus(line.billedAmount),
    new Prisma.Decimal(0),
  ).toDecimalPlaces(2);

  return { billingIntervalMonths, currency, periodStart, lines, subtotal };
}

export type CollectionInvoiceInput = {
  amountDue: Prisma.Decimal | string;
  dueDate: Date | null;
};

export type CanonicalCollectionHealth = {
  status: SubscriptionCollectionHealth;
  outstandingBalance: Prisma.Decimal;
  hasPastDueBalance: boolean;
  gracePeriodExceeded: boolean;
  attentionRequired: boolean;
  earliestPastDueDate: Date | null;
};

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function deriveCanonicalCollectionHealth(input: {
  invoices: CollectionInvoiceInput[];
  gracePeriodDays: number;
  asOf: Date;
}): CanonicalCollectionHealth {
  if (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0) {
    billingError("INVALID_GRACE_PERIOD", "Grace period must be a non-negative whole number of days.");
  }
  const asOf = utcDay(input.asOf);
  let outstandingBalance = new Prisma.Decimal(0);
  let earliestPastDueDate: Date | null = null;
  let gracePeriodExceeded = false;

  for (const invoice of input.invoices) {
    const amountDue = new Prisma.Decimal(invoice.amountDue);
    if (amountDue.lte(0)) continue;
    outstandingBalance = outstandingBalance.plus(amountDue);
    if (!invoice.dueDate) continue;
    const dueDate = utcDay(invoice.dueDate);
    if (dueDate >= asOf) continue;
    if (!earliestPastDueDate || dueDate < earliestPastDueDate) earliestPastDueDate = dueDate;
    const graceEnds = new Date(dueDate);
    graceEnds.setUTCDate(graceEnds.getUTCDate() + input.gracePeriodDays);
    if (asOf > graceEnds) gracePeriodExceeded = true;
  }

  const hasPastDueBalance = earliestPastDueDate != null;
  const status: SubscriptionCollectionHealth = input.invoices.length === 0
    ? "not_started"
    : gracePeriodExceeded
      ? "action_required"
      : hasPastDueBalance
        ? "past_due"
        : "current";

  return {
    status,
    outstandingBalance: outstandingBalance.toDecimalPlaces(2),
    hasPastDueBalance,
    gracePeriodExceeded,
    attentionRequired: gracePeriodExceeded,
    earliestPastDueDate,
  };
}
