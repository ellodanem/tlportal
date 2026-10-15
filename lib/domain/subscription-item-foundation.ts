import { assertSupportedSubscriptionIntervalMonths } from "./canonical-subscription";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;
const CYCLE_AMOUNT_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export type EffectiveDatedRate = {
  subscriptionItemId: string;
  billingIntervalMonths: number;
  effectiveFrom: string;
  effectiveUntil?: string | null;
};

export type ItemAssignmentPeriod = {
  subscriptionItemId?: string | null;
  endDate?: Date | string | null;
  status?: string | null;
};

export type ProviderLinkPeriod = {
  customerSubscriptionId: string;
  provider: string;
  endedAt?: Date | string | null;
};

function assertDateOnly(value: string, field: string): void {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD date-only format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid calendar date.`);
  }
}

export function assertValidEffectiveRatePeriod(rate: EffectiveDatedRate): void {
  if (!rate.subscriptionItemId.trim()) {
    throw new Error("A rate must belong to a subscription item.");
  }
  assertSupportedSubscriptionIntervalMonths(rate.billingIntervalMonths);
  assertDateOnly(rate.effectiveFrom, "effectiveFrom");
  if (rate.effectiveUntil != null) {
    assertDateOnly(rate.effectiveUntil, "effectiveUntil");
    if (rate.effectiveUntil <= rate.effectiveFrom) {
      throw new Error("effectiveUntil must be later than effectiveFrom.");
    }
  }
}

export function effectiveRatePeriodsOverlap(
  left: EffectiveDatedRate,
  right: EffectiveDatedRate,
): boolean {
  assertValidEffectiveRatePeriod(left);
  assertValidEffectiveRatePeriod(right);

  if (
    left.subscriptionItemId !== right.subscriptionItemId ||
    left.billingIntervalMonths !== right.billingIntervalMonths
  ) {
    return false;
  }

  const leftBeforeRightEnds = right.effectiveUntil == null || left.effectiveFrom < right.effectiveUntil;
  const rightBeforeLeftEnds = left.effectiveUntil == null || right.effectiveFrom < left.effectiveUntil;
  return leftBeforeRightEnds && rightBeforeLeftEnds;
}

export function assertNoOverlappingItemRates(rates: EffectiveDatedRate[]): void {
  for (let leftIndex = 0; leftIndex < rates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rates.length; rightIndex += 1) {
      if (effectiveRatePeriodsOverlap(rates[leftIndex], rates[rightIndex])) {
        throw new Error("Effective rate periods cannot overlap for the same item and billing basis.");
      }
    }
  }
}

export function assertAtMostOneOpenItemAssignment(assignments: ItemAssignmentPeriod[]): void {
  const openByItem = new Set<string>();
  for (const assignment of assignments) {
    const itemId = assignment.subscriptionItemId?.trim();
    if (!itemId || assignment.endDate != null || assignment.status === "cancelled") continue;
    if (openByItem.has(itemId)) {
      throw new Error("A subscription item cannot have multiple open hardware assignments.");
    }
    openByItem.add(itemId);
  }
}

export function assertNoCompetingOpenProviderLinks(links: ProviderLinkPeriod[]): void {
  const openKeys = new Set<string>();
  for (const link of links) {
    if (link.endedAt != null) continue;
    const key = `${link.customerSubscriptionId}\u0000${link.provider}`;
    if (openKeys.has(key)) {
      throw new Error("A subscription cannot have competing open links for the same provider.");
    }
    openKeys.add(key);
  }
}

function normalizedCycleAmount(value: string): string {
  const trimmed = value.trim();
  if (!CYCLE_AMOUNT_PATTERN.test(trimmed)) {
    throw new Error("Agreed cycle amount must be a non-negative decimal with at most two places.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return `${BigInt(whole).toString()}.${fraction.padEnd(2, "0")}`;
}

export function providerRateGroupFingerprint(input: {
  currency: string;
  billingIntervalMonths: number;
  agreedAmountPerCycle: string;
}): string {
  const currency = input.currency.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new Error("Currency must be a three-letter code.");
  }
  assertSupportedSubscriptionIntervalMonths(input.billingIntervalMonths);
  const amount = normalizedCycleAmount(input.agreedAmountPerCycle);
  return `${currency}:${input.billingIntervalMonths}:${amount}`;
}
