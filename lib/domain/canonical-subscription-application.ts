import {
  Prisma,
  type SubscriptionItemStatus,
  type SubscriptionLifecycleStatus,
} from "@prisma/client";

import {
  assertSupportedSubscriptionIntervalMonths,
  subscriptionGracePeriodDays,
  type SupportedSubscriptionIntervalMonths,
} from "./canonical-subscription";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type ExactMoneyInput = string | Prisma.Decimal;

export class CanonicalSubscriptionValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalSubscriptionValidationError";
    this.code = code;
  }
}

export function commercialDate(value: string, field: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_DATE",
      `${field} must use YYYY-MM-DD date-only format.`,
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_DATE",
      `${field} must be a valid calendar date.`,
    );
  }
  return parsed;
}

export function commercialDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_CURRENCY",
      "Currency must be a three-letter code.",
    );
  }
  return currency;
}

export function exactCycleAmount(value: ExactMoneyInput, field = "agreedAmountPerCycle"): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_AMOUNT",
      `${field} must be a valid decimal amount.`,
    );
  }

  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_AMOUNT",
      `${field} must be non-negative and have no more than two decimal places.`,
    );
  }
  if (amount.greaterThan("9999999999.99")) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_AMOUNT",
      `${field} exceeds the supported amount.`,
    );
  }
  return amount.toDecimalPlaces(2);
}

export function canonicalGracePeriodDays(value?: number | null): number {
  try {
    return subscriptionGracePeriodDays(value);
  } catch (error) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_GRACE_PERIOD",
      error instanceof Error ? error.message : "Grace period is invalid.",
    );
  }
}

export function canonicalBillingInterval(value: number): SupportedSubscriptionIntervalMonths {
  try {
    assertSupportedSubscriptionIntervalMonths(value);
    return value;
  } catch (error) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_BILLING_INTERVAL",
      error instanceof Error ? error.message : "Billing interval is invalid.",
    );
  }
}

export function assertSubscriptionDates(input: {
  commercialStartDate: string;
  billingAnchorDate: string;
  nextBillingDate: string;
}): { commercialStartDate: Date; billingAnchorDate: Date; nextBillingDate: Date } {
  const commercialStartDate = commercialDate(input.commercialStartDate, "commercialStartDate");
  const billingAnchorDate = commercialDate(input.billingAnchorDate, "billingAnchorDate");
  const nextBillingDate = commercialDate(input.nextBillingDate, "nextBillingDate");

  if (billingAnchorDate < commercialStartDate) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_BILLING_DATES",
      "billingAnchorDate cannot be before commercialStartDate.",
    );
  }
  if (nextBillingDate < billingAnchorDate) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_BILLING_DATES",
      "nextBillingDate cannot be before billingAnchorDate.",
    );
  }
  return { commercialStartDate, billingAnchorDate, nextBillingDate };
}

export function recurringEffectiveDateForAddition(input: {
  serviceActivatedDate: string;
  nextRenewalDate: string;
}): string {
  const activated = commercialDate(input.serviceActivatedDate, "serviceActivatedDate");
  const renewal = commercialDate(input.nextRenewalDate, "nextRenewalDate");
  if (activated > renewal) {
    throw new CanonicalSubscriptionValidationError(
      "STALE_RENEWAL_DATE",
      "nextRenewalDate must be on or after the service activation date.",
    );
  }
  return commercialDateString(renewal);
}

const LIFECYCLE_TRANSITIONS: Record<
  SubscriptionLifecycleStatus,
  ReadonlySet<SubscriptionLifecycleStatus>
> = {
  draft: new Set(["pending_activation", "canceled"]),
  pending_activation: new Set(["draft", "active", "canceled"]),
  active: new Set(["paused", "canceled", "ended"]),
  paused: new Set(["active", "canceled", "ended"]),
  canceled: new Set(),
  ended: new Set(),
};

export function assertLifecycleTransition(
  from: SubscriptionLifecycleStatus,
  to: SubscriptionLifecycleStatus,
): void {
  if (from === to) return;
  if (!LIFECYCLE_TRANSITIONS[from].has(to)) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_LIFECYCLE_TRANSITION",
      `Subscription lifecycle cannot move from ${from} to ${to}.`,
    );
  }
}

export function itemStatusForSubscription(
  lifecycle: SubscriptionLifecycleStatus,
): SubscriptionItemStatus {
  switch (lifecycle) {
    case "draft":
      return "draft";
    case "pending_activation":
      return "pending_activation";
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "canceled":
      return "canceled";
    case "ended":
      return "ended";
  }
}

function calendarDaysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export type AnnualProrationPreview = {
  currency: string;
  periodStart: string;
  periodEnd: string;
  prorationStart: string;
  futureRecurringEffectiveDate: string;
  totalCalendarDays: number;
  remainingCalendarDays: number;
  agreedAnnualAmount: Prisma.Decimal;
  proratedAmount: Prisma.Decimal;
};

export function previewAnnualProration(input: {
  annualPeriodStart: string;
  annualPeriodEnd: string;
  serviceActivatedDate: string;
  agreedAnnualAmount: ExactMoneyInput;
  currency: string;
}): AnnualProrationPreview {
  const periodStart = commercialDate(input.annualPeriodStart, "annualPeriodStart");
  const periodEnd = commercialDate(input.annualPeriodEnd, "annualPeriodEnd");
  const activated = commercialDate(input.serviceActivatedDate, "serviceActivatedDate");
  if (periodEnd <= periodStart) {
    throw new CanonicalSubscriptionValidationError(
      "INVALID_ANNUAL_PERIOD",
      "annualPeriodEnd must be later than annualPeriodStart.",
    );
  }
  if (activated < periodStart || activated > periodEnd) {
    throw new CanonicalSubscriptionValidationError(
      "ACTIVATION_OUTSIDE_ANNUAL_PERIOD",
      "serviceActivatedDate must fall within the current annual period or on its renewal boundary.",
    );
  }

  const agreedAnnualAmount = exactCycleAmount(input.agreedAnnualAmount, "agreedAnnualAmount");
  const totalCalendarDays = calendarDaysBetween(periodStart, periodEnd);
  const remainingCalendarDays = calendarDaysBetween(activated, periodEnd);
  const proratedAmount = agreedAnnualAmount
    .times(remainingCalendarDays)
    .dividedBy(totalCalendarDays)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    currency: normalizeCurrency(input.currency),
    periodStart: commercialDateString(periodStart),
    periodEnd: commercialDateString(periodEnd),
    prorationStart: commercialDateString(activated),
    futureRecurringEffectiveDate: commercialDateString(periodEnd),
    totalCalendarDays,
    remainingCalendarDays,
    agreedAnnualAmount,
    proratedAmount,
  };
}

export function normalizedMonthlyRecurringRevenue(
  cycleAmount: ExactMoneyInput,
  billingIntervalMonths: number,
): Prisma.Decimal {
  const interval = canonicalBillingInterval(billingIntervalMonths);
  return exactCycleAmount(cycleAmount).dividedBy(interval);
}

export function sumExactCycleAmounts(values: ExactMoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (total, value) => total.plus(exactCycleAmount(value)),
    new Prisma.Decimal(0),
  );
}
