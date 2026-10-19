import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { addUtcMonths, startOfUtcDay } from "@/lib/billing/recurring-period";
import {
  CanonicalNativeBillingError,
  resolveCanonicalBillingCycle,
  type CanonicalBillingConfigurationInput,
} from "@/lib/domain/canonical-native-billing";
import {
  canonicalBillingInterval,
  exactCycleAmount,
  normalizeCurrency,
} from "@/lib/domain/canonical-subscription-application";
import { providerRateGroupFingerprint } from "@/lib/domain/subscription-item-foundation";

export const CANONICAL_STRIPE_SHADOW_FLAG = "CANONICAL_STRIPE_SHADOW_ENABLED";

export type CanonicalStripeShadowEnvironment = {
  CANONICAL_STRIPE_SHADOW_ENABLED?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export class CanonicalStripeShadowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeShadowError";
    this.code = code;
  }
}

function shadowError(code: string, message: string): never {
  throw new CanonicalStripeShadowError(code, message);
}

export function canonicalStripeShadowEnabled(
  environment: CanonicalStripeShadowEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.VERCEL_ENV !== "production"
    && environment.CANONICAL_STRIPE_SHADOW_ENABLED === "true";
}

export function assertCanonicalStripeShadowEnabled(
  environment: CanonicalStripeShadowEnvironment = process.env,
): void {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    shadowError(
      "PRODUCTION_SHADOW_DISABLED",
      "Canonical Stripe shadow integration is disabled in production during Phase 3B1.",
    );
  }
  if (environment.CANONICAL_STRIPE_SHADOW_ENABLED !== "true") {
    shadowError(
      "SHADOW_FEATURE_DISABLED",
      `${CANONICAL_STRIPE_SHADOW_FLAG}=true is required for local canonical Stripe shadow reconciliation.`,
    );
  }
}

export type CanonicalStripeConfigurationInput = CanonicalBillingConfigurationInput & {
  id: string;
  customerId: string;
  controlMode: "legacy" | "shadow" | "canonical";
  collectionMethod: "manual_invoice" | "stripe_autocharge" | null;
  billingAnchorDate: Date | null;
  nextBillingDate: Date | null;
};

export type CanonicalStripeRateGroup = {
  fingerprint: string;
  currency: string;
  billingIntervalMonths: 1 | 3 | 4 | 6 | 12;
  agreedAmountPerCycle: Prisma.Decimal;
  quantity: number;
  recurringTotal: Prisma.Decimal;
  items: CanonicalStripeRateGroupItem[];
  subscriptionItemIds: string[];
  classifications: ("standard" | "negotiated")[];
};

export type CanonicalStripeRateGroupItem = {
  subscriptionItemId: string;
  subscriptionItemRateId: string;
  serviceLabel: string;
  classification: "standard" | "negotiated";
};

export type CanonicalStripeRateGroupPlan = {
  subscriptionId: string;
  customerId: string;
  effectiveAt: Date;
  billingAnchorDate: Date;
  nextBillingDate: Date;
  currency: string;
  billingIntervalMonths: 1 | 3 | 4 | 6 | 12;
  expectedRecurringTotal: Prisma.Decimal;
  groups: CanonicalStripeRateGroup[];
};

function sameUtcDay(left: Date, right: Date): boolean {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

/** Group exact canonical item rates without crossing subscription boundaries. */
export function buildCanonicalStripeRateGroups(
  configuration: CanonicalStripeConfigurationInput,
  effectiveAt: Date,
  options: { requireActive?: boolean } = {},
): CanonicalStripeRateGroupPlan {
  if (configuration.controlMode === "legacy") {
    shadowError("LEGACY_SUBSCRIPTION_PROTECTED", "Legacy subscriptions cannot enter canonical Stripe shadow planning.");
  }
  if (configuration.collectionMethod !== "stripe_autocharge") {
    shadowError("STRIPE_COLLECTION_REQUIRED", "Canonical Stripe planning requires Stripe autocharge collection.");
  }
  if (!configuration.billingAnchorDate || !configuration.nextBillingDate) {
    shadowError("BILLING_DATES_INCOMPLETE", "Billing anchor and next billing date are required.");
  }

  let cycle;
  try {
    cycle = resolveCanonicalBillingCycle(configuration, startOfUtcDay(effectiveAt), {
      requireActive: options.requireActive,
    });
  } catch (caught) {
    if (caught instanceof CanonicalNativeBillingError) {
      shadowError(caught.code, caught.message);
    }
    throw caught;
  }

  const grouped = new Map<string, CanonicalStripeRateGroup>();
  for (const line of cycle.lines) {
    const fingerprint = providerRateGroupFingerprint({
      currency: line.currency,
      billingIntervalMonths: cycle.billingIntervalMonths,
      agreedAmountPerCycle: line.agreedAmountPerCycle.toFixed(2),
    });
    const existing = grouped.get(fingerprint);
    if (existing) {
      existing.quantity += 1;
      existing.recurringTotal = existing.recurringTotal.plus(line.agreedAmountPerCycle);
      existing.items.push({
        subscriptionItemId: line.subscriptionItemId,
        subscriptionItemRateId: line.subscriptionItemRateId,
        serviceLabel: line.description,
        classification: line.classification,
      });
      continue;
    }
    grouped.set(fingerprint, {
      fingerprint,
      currency: line.currency,
      billingIntervalMonths: cycle.billingIntervalMonths,
      agreedAmountPerCycle: line.agreedAmountPerCycle,
      quantity: 1,
      recurringTotal: line.agreedAmountPerCycle,
      items: [{
        subscriptionItemId: line.subscriptionItemId,
        subscriptionItemRateId: line.subscriptionItemRateId,
        serviceLabel: line.description,
        classification: line.classification,
      }],
      subscriptionItemIds: [],
      classifications: [],
    });
  }

  const groups = [...grouped.values()]
    .map((group) => {
      const items = [...group.items].sort((left, right) =>
        left.subscriptionItemId.localeCompare(right.subscriptionItemId));
      return {
        ...group,
        recurringTotal: group.recurringTotal.toDecimalPlaces(2),
        items,
        subscriptionItemIds: items.map((item) => item.subscriptionItemId),
        classifications: items.map((item) => item.classification),
      };
    })
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));

  return {
    subscriptionId: configuration.id,
    customerId: configuration.customerId,
    effectiveAt: startOfUtcDay(effectiveAt),
    billingAnchorDate: startOfUtcDay(configuration.billingAnchorDate),
    nextBillingDate: startOfUtcDay(configuration.nextBillingDate),
    currency: cycle.currency,
    billingIntervalMonths: cycle.billingIntervalMonths,
    expectedRecurringTotal: groups.reduce(
      (total, group) => total.plus(group.recurringTotal),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2),
    groups,
  };
}

export type LocalStripeProviderItem = {
  id: string;
  subscriptionProviderLinkId: string;
  externalSubscriptionItemId: string;
  externalPriceId: string;
  currency: string;
  billingIntervalMonths: number;
  agreedAmountPerCycle: Prisma.Decimal | string;
  quantity: number;
  rateGroupFingerprint: string;
};

export type LocalStripeProviderLink = {
  id: string;
  customerSubscriptionId: string;
  provider: string;
  externalSubscriptionId: string;
  providerStatus: string | null;
  endedAt: Date | null;
  providerItems: LocalStripeProviderItem[];
};

export type ObservedStripeRecurringItem = {
  externalSubscriptionItemId: string;
  externalPriceId: string | null;
  currency: string | null;
  billingIntervalMonths: number | null;
  unitAmount: Prisma.Decimal | string | null;
  quantity: number | null;
};

export type ObservedStripeSubscription = {
  externalSubscriptionId: string;
  status: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd?: boolean;
  items: ObservedStripeRecurringItem[];
};

export type StripeShadowIssueCode =
  | "provider_link_missing"
  | "provider_link_ended"
  | "subscription_ownership_conflict"
  | "provider_state_missing"
  | "provider_subscription_mismatch"
  | "provider_status_mismatch"
  | "billing_anchor_mismatch"
  | "missing_provider_mapping"
  | "provider_mapping_mismatch"
  | "missing_price_reference"
  | "missing_provider_item"
  | "unexpected_provider_item"
  | "price_reference_mismatch"
  | "price_mismatch"
  | "quantity_mismatch"
  | "currency_mismatch"
  | "interval_mismatch"
  | "recurring_total_mismatch";

export type StripeShadowIssue = {
  code: StripeShadowIssueCode;
  severity: "warning" | "error";
  fingerprint: string | null;
  externalSubscriptionItemId: string | null;
  explanation: string;
  expected: string | null;
  observed: string | null;
};

export type StripeRateGroupComparison = {
  fingerprint: string;
  expectedQuantity: number;
  observedQuantity: number | null;
  expectedUnitAmount: string;
  observedUnitAmount: string | null;
  expectedRecurringTotal: string;
  observedRecurringTotal: string | null;
  externalSubscriptionItemId: string | null;
  externalPriceId: string | null;
  status: "matched" | "missing" | "mismatched" | "insufficient_evidence";
  subscriptionItemIds: string[];
};

export type CanonicalStripeReconciliation = {
  subscriptionId: string;
  externalSubscriptionId: string | null;
  status: "matched" | "discrepant" | "ownership_conflict" | "insufficient_evidence";
  expectedRecurringTotal: string;
  observedRecurringTotal: string | null;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
  providerStatus: string | null;
  groups: StripeRateGroupComparison[];
  issues: StripeShadowIssue[];
};

function issue(
  code: StripeShadowIssueCode,
  explanation: string,
  options: {
    severity?: "warning" | "error";
    fingerprint?: string | null;
    externalSubscriptionItemId?: string | null;
    expected?: string | null;
    observed?: string | null;
  } = {},
): StripeShadowIssue {
  return {
    code,
    severity: options.severity ?? "error",
    fingerprint: options.fingerprint ?? null,
    externalSubscriptionItemId: options.externalSubscriptionItemId ?? null,
    explanation,
    expected: options.expected ?? null,
    observed: options.observed ?? null,
  };
}

function observedItemAmount(item: ObservedStripeRecurringItem): Prisma.Decimal | null {
  if (item.unitAmount == null) return null;
  try {
    return exactCycleAmount(item.unitAmount, "provider unit amount");
  } catch {
    return null;
  }
}

function normalizedCurrencyOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return normalizeCurrency(value);
  } catch {
    return null;
  }
}

function reconciliationStatus(issues: StripeShadowIssue[]): CanonicalStripeReconciliation["status"] {
  if (issues.some((entry) => entry.code === "subscription_ownership_conflict")) return "ownership_conflict";
  if (issues.some((entry) => [
    "provider_link_missing",
    "provider_state_missing",
    "missing_price_reference",
    "missing_provider_mapping",
  ].includes(entry.code))) return "insufficient_evidence";
  return issues.length ? "discrepant" : "matched";
}

/** Compare explicit canonical intent with an already-observed Stripe state. No provider calls or writes. */
export function reconcileCanonicalStripeSubscription(input: {
  expected: CanonicalStripeRateGroupPlan;
  providerLink: LocalStripeProviderLink | null;
  observed: ObservedStripeSubscription | null;
  observedOwnerSubscriptionId?: string | null;
}): CanonicalStripeReconciliation {
  const issues: StripeShadowIssue[] = [];
  const link = input.providerLink;
  const observed = input.observed;
  if (!link) {
    issues.push(issue("provider_link_missing", "No open Stripe provider relationship is recorded for this subscription."));
  } else {
    if (link.provider !== "stripe") {
      issues.push(issue("subscription_ownership_conflict", "The provider relationship is not a Stripe relationship."));
    }
    if (link.customerSubscriptionId !== input.expected.subscriptionId) {
      issues.push(issue("subscription_ownership_conflict", "The provider relationship belongs to another canonical subscription."));
    }
    if (link.endedAt) {
      issues.push(issue("provider_link_ended", "The selected Stripe provider relationship is historical and has ended."));
    }
  }
  if (!observed) {
    issues.push(issue("provider_state_missing", "Observed Stripe subscription data is required for shadow reconciliation."));
  } else if (link) {
    if (
      input.observedOwnerSubscriptionId
      && input.observedOwnerSubscriptionId !== input.expected.subscriptionId
    ) {
      issues.push(issue(
        "subscription_ownership_conflict",
        "The observed Stripe subscription is already mapped to a different canonical subscription.",
        { expected: input.expected.subscriptionId, observed: input.observedOwnerSubscriptionId },
      ));
    }
    if (observed.externalSubscriptionId !== link.externalSubscriptionId) {
      issues.push(issue(
        "provider_subscription_mismatch",
        "Observed Stripe subscription identity does not match the exact provider link.",
        { expected: link.externalSubscriptionId, observed: observed.externalSubscriptionId },
      ));
    }
    if (!observed.status || !["active", "trialing"].includes(observed.status)) {
      issues.push(issue(
        "provider_status_mismatch",
        "Stripe provider status is not active or trialing.",
        { expected: "active or trialing", observed: observed.status },
      ));
    }
    const expectedPeriodStart = addUtcMonths(
      input.expected.nextBillingDate,
      -input.expected.billingIntervalMonths,
    );
    if (
      !observed.currentPeriodStart
      || !observed.currentPeriodEnd
      || !sameUtcDay(observed.currentPeriodStart, expectedPeriodStart)
      || !sameUtcDay(observed.currentPeriodEnd, input.expected.nextBillingDate)
    ) {
      issues.push(issue(
        "billing_anchor_mismatch",
        "Stripe billing-period boundaries do not match the preserved canonical anniversary.",
        {
          expected: `${expectedPeriodStart.toISOString().slice(0, 10)}..${input.expected.nextBillingDate.toISOString().slice(0, 10)}`,
          observed: observed.currentPeriodStart && observed.currentPeriodEnd
            ? `${observed.currentPeriodStart.toISOString().slice(0, 10)}..${observed.currentPeriodEnd.toISOString().slice(0, 10)}`
            : null,
        },
      ));
    }
  }

  const localByFingerprint = new Map(
    (link?.providerItems ?? []).map((entry) => [entry.rateGroupFingerprint, entry]),
  );
  const observedById = new Map(
    (observed?.items ?? []).map((entry) => [entry.externalSubscriptionItemId, entry]),
  );
  const claimedObservedIds = new Set<string>();
  const comparisons = input.expected.groups.map<StripeRateGroupComparison>((group) => {
    const mapping = localByFingerprint.get(group.fingerprint) ?? null;
    if (!mapping) {
      issues.push(issue(
        "missing_provider_mapping",
        "The canonical rate group has no exact local provider-item mapping.",
        { fingerprint: group.fingerprint },
      ));
      return {
        fingerprint: group.fingerprint,
        expectedQuantity: group.quantity,
        observedQuantity: null,
        expectedUnitAmount: group.agreedAmountPerCycle.toFixed(2),
        observedUnitAmount: null,
        expectedRecurringTotal: group.recurringTotal.toFixed(2),
        observedRecurringTotal: null,
        externalSubscriptionItemId: null,
        externalPriceId: null,
        status: "insufficient_evidence",
        subscriptionItemIds: group.subscriptionItemIds,
      };
    }
    if (!mapping.externalPriceId.trim()) {
      issues.push(issue(
        "missing_price_reference",
        "The mapped provider item has no verified Stripe Price reference.",
        { fingerprint: group.fingerprint, externalSubscriptionItemId: mapping.externalSubscriptionItemId },
      ));
    }
    const mappedAmount = observedItemAmount({
      externalSubscriptionItemId: mapping.externalSubscriptionItemId,
      externalPriceId: mapping.externalPriceId,
      currency: mapping.currency,
      billingIntervalMonths: mapping.billingIntervalMonths,
      unitAmount: mapping.agreedAmountPerCycle,
      quantity: mapping.quantity,
    });
    if (
      !mappedAmount
      || !mappedAmount.equals(group.agreedAmountPerCycle)
      || normalizedCurrencyOrNull(mapping.currency) !== group.currency
      || mapping.billingIntervalMonths !== group.billingIntervalMonths
      || mapping.quantity !== group.quantity
    ) {
      issues.push(issue(
        "provider_mapping_mismatch",
        "The stored provider-item mapping does not preserve the canonical rate-group terms.",
        {
          fingerprint: group.fingerprint,
          externalSubscriptionItemId: mapping.externalSubscriptionItemId,
          expected: `${group.currency}:${group.billingIntervalMonths}:${group.agreedAmountPerCycle.toFixed(2)}:${group.quantity}`,
          observed: `${mapping.currency}:${mapping.billingIntervalMonths}:${mapping.agreedAmountPerCycle}:${mapping.quantity}`,
        },
      ));
    }
    const providerItem = observedById.get(mapping.externalSubscriptionItemId) ?? null;
    if (!providerItem) {
      issues.push(issue(
        "missing_provider_item",
        "The mapped Stripe subscription item is absent from the observed provider subscription.",
        { fingerprint: group.fingerprint, externalSubscriptionItemId: mapping.externalSubscriptionItemId },
      ));
      return {
        fingerprint: group.fingerprint,
        expectedQuantity: group.quantity,
        observedQuantity: null,
        expectedUnitAmount: group.agreedAmountPerCycle.toFixed(2),
        observedUnitAmount: null,
        expectedRecurringTotal: group.recurringTotal.toFixed(2),
        observedRecurringTotal: null,
        externalSubscriptionItemId: mapping.externalSubscriptionItemId,
        externalPriceId: mapping.externalPriceId || null,
        status: mapping.externalPriceId.trim() ? "missing" : "insufficient_evidence",
        subscriptionItemIds: group.subscriptionItemIds,
      };
    }
    claimedObservedIds.add(providerItem.externalSubscriptionItemId);
    const amount = observedItemAmount(providerItem);
    const quantity = providerItem.quantity != null && Number.isInteger(providerItem.quantity)
      ? providerItem.quantity
      : null;
    const observedTotal = amount && quantity != null
      ? amount.times(quantity).toDecimalPlaces(2)
      : null;
    let mismatch = false;
    if (!providerItem.externalPriceId || providerItem.externalPriceId !== mapping.externalPriceId) {
      mismatch = true;
      issues.push(issue(
        "price_reference_mismatch",
        "Observed Stripe Price does not match the recorded provider mapping.",
        {
          fingerprint: group.fingerprint,
          externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
          expected: mapping.externalPriceId || null,
          observed: providerItem.externalPriceId,
        },
      ));
    }
    if (!amount || !amount.equals(group.agreedAmountPerCycle)) {
      mismatch = true;
      issues.push(issue(
        "price_mismatch",
        "Observed Stripe unit amount differs from the agreed canonical cycle amount.",
        {
          fingerprint: group.fingerprint,
          externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
          expected: group.agreedAmountPerCycle.toFixed(2),
          observed: amount?.toFixed(2) ?? null,
        },
      ));
    }
    if (quantity !== group.quantity) {
      mismatch = true;
      issues.push(issue(
        "quantity_mismatch",
        "Observed Stripe quantity differs from canonical service membership.",
        {
          fingerprint: group.fingerprint,
          externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
          expected: String(group.quantity),
          observed: quantity == null ? null : String(quantity),
        },
      ));
    }
    if (normalizedCurrencyOrNull(providerItem.currency) !== group.currency) {
      mismatch = true;
      issues.push(issue(
        "currency_mismatch",
        "Observed Stripe currency differs from the canonical rate group.",
        {
          fingerprint: group.fingerprint,
          externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
          expected: group.currency,
          observed: providerItem.currency,
        },
      ));
    }
    let intervalMatches = false;
    if (providerItem.billingIntervalMonths != null) {
      try {
        intervalMatches = canonicalBillingInterval(providerItem.billingIntervalMonths)
          === group.billingIntervalMonths;
      } catch {
        intervalMatches = false;
      }
    }
    if (!intervalMatches) {
      mismatch = true;
      issues.push(issue(
        "interval_mismatch",
        "Observed Stripe billing interval differs from the canonical rate group.",
        {
          fingerprint: group.fingerprint,
          externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
          expected: String(group.billingIntervalMonths),
          observed: providerItem.billingIntervalMonths == null ? null : String(providerItem.billingIntervalMonths),
        },
      ));
    }
    return {
      fingerprint: group.fingerprint,
      expectedQuantity: group.quantity,
      observedQuantity: quantity,
      expectedUnitAmount: group.agreedAmountPerCycle.toFixed(2),
      observedUnitAmount: amount?.toFixed(2) ?? null,
      expectedRecurringTotal: group.recurringTotal.toFixed(2),
      observedRecurringTotal: observedTotal?.toFixed(2) ?? null,
      externalSubscriptionItemId: mapping.externalSubscriptionItemId,
      externalPriceId: mapping.externalPriceId || null,
      status: mismatch ? "mismatched" : "matched",
      subscriptionItemIds: group.subscriptionItemIds,
    };
  });

  for (const providerItem of observed?.items ?? []) {
    if (claimedObservedIds.has(providerItem.externalSubscriptionItemId)) continue;
    issues.push(issue(
      "unexpected_provider_item",
      "Stripe contains a recurring item that is not mapped to an expected canonical rate group.",
      {
        externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
        observed: providerItem.externalPriceId,
      },
    ));
  }

  const observedTotal = observed
    ? observed.items.reduce<Prisma.Decimal | null>((total, entry) => {
        const amount = observedItemAmount(entry);
        if (!amount || entry.quantity == null || !Number.isInteger(entry.quantity)) return null;
        return total == null ? null : total.plus(amount.times(entry.quantity));
      }, new Prisma.Decimal(0))
    : null;
  if (observedTotal && !observedTotal.equals(input.expected.expectedRecurringTotal)) {
    issues.push(issue(
      "recurring_total_mismatch",
      "Observed Stripe recurring total differs from canonical recurring intent.",
      {
        expected: input.expected.expectedRecurringTotal.toFixed(2),
        observed: observedTotal.toFixed(2),
      },
    ));
  }

  issues.sort((left, right) => [
    left.code,
    left.fingerprint ?? "",
    left.externalSubscriptionItemId ?? "",
  ].join("\u0000").localeCompare([
    right.code,
    right.fingerprint ?? "",
    right.externalSubscriptionItemId ?? "",
  ].join("\u0000")));

  return {
    subscriptionId: input.expected.subscriptionId,
    externalSubscriptionId: link?.externalSubscriptionId ?? null,
    status: reconciliationStatus(issues),
    expectedRecurringTotal: input.expected.expectedRecurringTotal.toFixed(2),
    observedRecurringTotal: observedTotal?.toDecimalPlaces(2).toFixed(2) ?? null,
    billingPeriodStart: observed?.currentPeriodStart ?? null,
    billingPeriodEnd: observed?.currentPeriodEnd ?? null,
    providerStatus: observed?.status ?? link?.providerStatus ?? null,
    groups: comparisons,
    issues,
  };
}

export type CanonicalStripeOperationAction = {
  kind: "create_rate_group" | "replace_price" | "update_quantity" | "retire_rate_group";
  fingerprint: string;
  externalSubscriptionItemId: string | null;
  externalPriceId: string | null;
  fromQuantity: number | null;
  toQuantity: number;
  agreedAmountPerCycle: string | null;
  subscriptionItemIds: string[];
};

export type CanonicalStripeOperationPlan = {
  subscriptionId: string;
  externalSubscriptionId: string | null;
  operationKey: string;
  requestFingerprint: string;
  effectiveAt: Date;
  preserveBillingAnchor: true;
  prorationBehavior: "none";
  executable: false;
  createsBillingOperation: false;
  expectedRecurringTotal: string;
  actions: CanonicalStripeOperationAction[];
  blockers: StripeShadowIssue[];
};

/** Preview only. Phase 3B1 deliberately exposes no executor and writes no BillingOperation. */
export function planCanonicalStripeOperations(input: {
  expected: CanonicalStripeRateGroupPlan;
  providerLink: LocalStripeProviderLink | null;
  observed: ObservedStripeSubscription | null;
  reconciliation: CanonicalStripeReconciliation;
}): CanonicalStripeOperationPlan {
  const mappedByFingerprint = new Map(
    (input.providerLink?.providerItems ?? []).map((entry) => [entry.rateGroupFingerprint, entry]),
  );
  const observedById = new Map(
    (input.observed?.items ?? []).map((entry) => [entry.externalSubscriptionItemId, entry]),
  );
  const expectedFingerprints = new Set(input.expected.groups.map((entry) => entry.fingerprint));
  const actions: CanonicalStripeOperationAction[] = [];

  for (const group of input.expected.groups) {
    const mapping = mappedByFingerprint.get(group.fingerprint) ?? null;
    const observed = mapping ? observedById.get(mapping.externalSubscriptionItemId) ?? null : null;
    const observedAmount = observed ? observedItemAmount(observed) : null;
    if (!mapping || !observed) {
      actions.push({
        kind: "create_rate_group",
        fingerprint: group.fingerprint,
        externalSubscriptionItemId: mapping?.externalSubscriptionItemId ?? null,
        externalPriceId: mapping?.externalPriceId || null,
        fromQuantity: observed?.quantity ?? null,
        toQuantity: group.quantity,
        agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
        subscriptionItemIds: group.subscriptionItemIds,
      });
      continue;
    }
    if (
      !observedAmount
      || !observedAmount.equals(group.agreedAmountPerCycle)
      || observed.externalPriceId !== mapping.externalPriceId
      || observed.currency?.toUpperCase() !== group.currency
      || observed.billingIntervalMonths !== group.billingIntervalMonths
    ) {
      actions.push({
        kind: "replace_price",
        fingerprint: group.fingerprint,
        externalSubscriptionItemId: mapping.externalSubscriptionItemId,
        externalPriceId: mapping.externalPriceId || null,
        fromQuantity: observed.quantity,
        toQuantity: group.quantity,
        agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
        subscriptionItemIds: group.subscriptionItemIds,
      });
    } else if (observed.quantity !== group.quantity) {
      actions.push({
        kind: "update_quantity",
        fingerprint: group.fingerprint,
        externalSubscriptionItemId: mapping.externalSubscriptionItemId,
        externalPriceId: mapping.externalPriceId || null,
        fromQuantity: observed.quantity,
        toQuantity: group.quantity,
        agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
        subscriptionItemIds: group.subscriptionItemIds,
      });
    }
  }

  for (const mapping of input.providerLink?.providerItems ?? []) {
    if (expectedFingerprints.has(mapping.rateGroupFingerprint)) continue;
    actions.push({
      kind: "retire_rate_group",
      fingerprint: mapping.rateGroupFingerprint,
      externalSubscriptionItemId: mapping.externalSubscriptionItemId,
      externalPriceId: mapping.externalPriceId || null,
      fromQuantity: observedById.get(mapping.externalSubscriptionItemId)?.quantity ?? mapping.quantity,
      toQuantity: 0,
      agreedAmountPerCycle: null,
      subscriptionItemIds: [],
    });
  }

  actions.sort((left, right) => [left.kind, left.fingerprint].join("\u0000")
    .localeCompare([right.kind, right.fingerprint].join("\u0000")));
  const canonical = JSON.stringify({
    version: 1,
    subscriptionId: input.expected.subscriptionId,
    externalSubscriptionId: input.providerLink?.externalSubscriptionId ?? null,
    effectiveAt: input.expected.nextBillingDate.toISOString().slice(0, 10),
    preserveBillingAnchor: true,
    prorationBehavior: "none",
    expectedRecurringTotal: input.expected.expectedRecurringTotal.toFixed(2),
    actions,
  });
  const requestFingerprint = createHash("sha256").update(canonical).digest("hex");
  const blockers = input.reconciliation.issues.filter((entry) => [
    "subscription_ownership_conflict",
    "provider_link_missing",
    "provider_state_missing",
    "missing_price_reference",
    "provider_mapping_mismatch",
  ].includes(entry.code));
  return {
    subscriptionId: input.expected.subscriptionId,
    externalSubscriptionId: input.providerLink?.externalSubscriptionId ?? null,
    operationKey: `canonical-stripe-shadow:${input.expected.subscriptionId}:${requestFingerprint}`,
    requestFingerprint,
    effectiveAt: input.expected.nextBillingDate,
    preserveBillingAnchor: true,
    prorationBehavior: "none",
    executable: false,
    createsBillingOperation: false,
    expectedRecurringTotal: input.expected.expectedRecurringTotal.toFixed(2),
    actions,
    blockers,
  };
}

export type ObservedStripeInvoiceLine = {
  externalInvoiceLineId: string;
  externalSubscriptionItemId: string | null;
  externalPriceId: string | null;
  currency: string;
  quantity: number;
  recurringSubtotal: Prisma.Decimal | string;
  discountAmount?: Prisma.Decimal | string;
  taxAmount?: Prisma.Decimal | string;
  creditAmount?: Prisma.Decimal | string;
};

export type CanonicalStripeInvoiceSnapshotPreview = {
  replayKey: string;
  externalInvoiceLineId: string;
  subscriptionItemId: string;
  subscriptionItemRateId: string;
  providerInvoiceLineReference: string;
  serviceLabelSnapshot: string;
  agreedAmountPerCycleSnapshot: string;
  billedAmount: string;
  currency: string;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
};

export type CanonicalStripeInvoiceAttribution = {
  invoiceReplayKey: string;
  externalInvoiceId: string;
  subscriptionId: string;
  externalSubscriptionId: string;
  status: "complete" | "partial" | "insufficient_evidence";
  expectedRecurringTotal: string;
  observedRecurringSubtotal: string;
  allocationLimitations: string[];
  unattributedLineIds: string[];
  snapshots: CanonicalStripeInvoiceSnapshotPreview[];
};

/**
 * Prepare immutable service attribution. Discounts, taxes, credits, quantity
 * mismatches, or aggregate inconsistencies remain explicit limitations rather
 * than being allocated across services by guesswork.
 */
export function planCanonicalStripeInvoiceAttribution(input: {
  externalInvoiceId: string;
  externalSubscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  expected: CanonicalStripeRateGroupPlan;
  providerLink: LocalStripeProviderLink;
  lines: ObservedStripeInvoiceLine[];
}): CanonicalStripeInvoiceAttribution {
  if (input.providerLink.customerSubscriptionId !== input.expected.subscriptionId) {
    shadowError("SUBSCRIPTION_OWNERSHIP_CONFLICT", "Invoice provider link belongs to another subscription.");
  }
  if (input.providerLink.externalSubscriptionId !== input.externalSubscriptionId) {
    shadowError("PROVIDER_SUBSCRIPTION_MISMATCH", "Invoice subscription does not match the exact provider link.");
  }
  const expectedByFingerprint = new Map(input.expected.groups.map((group) => [group.fingerprint, group]));
  const mappingByExternalId = new Map(
    input.providerLink.providerItems.map((entry) => [entry.externalSubscriptionItemId, entry]),
  );
  const itemLineById = new Map(
    input.expected.groups.flatMap((group) => group.items.map((item) => [
      item.subscriptionItemId,
      {
        rateId: item.subscriptionItemRateId,
        label: item.serviceLabel,
        amount: group.agreedAmountPerCycle,
        currency: group.currency,
      },
    ] as const)),
  );
  const snapshots: CanonicalStripeInvoiceSnapshotPreview[] = [];
  const limitations: string[] = [];
  const unattributed = new Set<string>();
  let observedSubtotal = new Prisma.Decimal(0);

  for (const line of [...input.lines].sort((left, right) =>
    left.externalInvoiceLineId.localeCompare(right.externalInvoiceLineId))) {
    const lineSubtotal = exactCycleAmount(line.recurringSubtotal, "invoice recurring subtotal");
    observedSubtotal = observedSubtotal.plus(lineSubtotal);
    const mapping = line.externalSubscriptionItemId
      ? mappingByExternalId.get(line.externalSubscriptionItemId) ?? null
      : null;
    const group = mapping ? expectedByFingerprint.get(mapping.rateGroupFingerprint) ?? null : null;
    if (!mapping || !group) {
      limitations.push(`Invoice line ${line.externalInvoiceLineId} has no exact provider-item-to-rate-group mapping.`);
      unattributed.add(line.externalInvoiceLineId);
      continue;
    }
    if (line.externalPriceId !== mapping.externalPriceId) {
      limitations.push(`Invoice line ${line.externalInvoiceLineId} uses an unverified Stripe Price.`);
      unattributed.add(line.externalInvoiceLineId);
      continue;
    }
    if (normalizedCurrencyOrNull(line.currency) !== group.currency) {
      limitations.push(`Invoice line ${line.externalInvoiceLineId} currency does not match the canonical rate group.`);
      unattributed.add(line.externalInvoiceLineId);
      continue;
    }
    const discount = exactCycleAmount(line.discountAmount ?? "0", "invoice line discount");
    const tax = exactCycleAmount(line.taxAmount ?? "0", "invoice line tax");
    const credit = exactCycleAmount(line.creditAmount ?? "0", "invoice line credit");
    if (!discount.isZero() || !tax.isZero() || !credit.isZero()) {
      limitations.push(`Invoice line ${line.externalInvoiceLineId} contains discounts, taxes, or credits that cannot be safely allocated per service.`);
      unattributed.add(line.externalInvoiceLineId);
      continue;
    }
    if (line.quantity !== group.quantity || !lineSubtotal.equals(group.recurringTotal)) {
      limitations.push(`Invoice line ${line.externalInvoiceLineId} quantity or subtotal differs from the canonical rate group.`);
      unattributed.add(line.externalInvoiceLineId);
      continue;
    }
    for (const itemId of group.subscriptionItemIds) {
      const item = itemLineById.get(itemId)!;
      snapshots.push({
        replayKey: `stripe-invoice-attribution:${input.externalInvoiceId}:${line.externalInvoiceLineId}:${itemId}`,
        externalInvoiceLineId: line.externalInvoiceLineId,
        subscriptionItemId: itemId,
        subscriptionItemRateId: item.rateId,
        providerInvoiceLineReference: line.externalInvoiceLineId,
        serviceLabelSnapshot: item.label,
        agreedAmountPerCycleSnapshot: item.amount.toFixed(2),
        billedAmount: item.amount.toFixed(2),
        currency: item.currency,
        servicePeriodStart: startOfUtcDay(input.periodStart),
        servicePeriodEnd: startOfUtcDay(input.periodEnd),
      });
    }
  }
  snapshots.sort((left, right) => left.replayKey.localeCompare(right.replayKey));
  limitations.sort();
  const status: CanonicalStripeInvoiceAttribution["status"] = limitations.length === 0
    ? "complete"
    : snapshots.length > 0
      ? "partial"
      : "insufficient_evidence";
  return {
    invoiceReplayKey: canonicalStripeInvoiceReplayKey(input.externalInvoiceId),
    externalInvoiceId: input.externalInvoiceId,
    subscriptionId: input.expected.subscriptionId,
    externalSubscriptionId: input.externalSubscriptionId,
    status,
    expectedRecurringTotal: input.expected.expectedRecurringTotal.toFixed(2),
    observedRecurringSubtotal: observedSubtotal.toDecimalPlaces(2).toFixed(2),
    allocationLimitations: limitations,
    unattributedLineIds: [...unattributed].sort(),
    snapshots,
  };
}

export function canonicalStripeInvoiceReplayKey(externalInvoiceId: string): string {
  const normalized = externalInvoiceId.trim();
  if (!normalized) shadowError("INVOICE_REFERENCE_REQUIRED", "Stripe invoice reference is required.");
  return `canonical-stripe-invoice:${normalized}`;
}

export function canonicalStripePaymentReplayKey(
  externalInvoiceId: string,
  externalPaymentId: string,
): string {
  const invoiceId = externalInvoiceId.trim();
  const paymentId = externalPaymentId.trim();
  if (!invoiceId || !paymentId) {
    shadowError("PAYMENT_REFERENCE_REQUIRED", "Stripe invoice and payment references are required.");
  }
  return `canonical-stripe-payment:${invoiceId}:${paymentId}`;
}
