/**
 * Commercial cadences supported by canonical billing. Four-month terms are
 * required for the existing Howard and Autozone agreements; keep this list
 * shared so validation and UI do not drift from the database constraints.
 */
export const SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS = [1, 3, 4, 6, 12] as const;

export type SupportedSubscriptionIntervalMonths =
  (typeof SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS)[number];

export const DEFAULT_SUBSCRIPTION_GRACE_PERIOD_DAYS = 7;

export function isSupportedSubscriptionIntervalMonths(
  value: number,
): value is SupportedSubscriptionIntervalMonths {
  return SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS.some((months) => months === value);
}

export function assertSupportedSubscriptionIntervalMonths(
  value: number,
): asserts value is SupportedSubscriptionIntervalMonths {
  if (!isSupportedSubscriptionIntervalMonths(value)) {
    throw new Error("Billing interval must be 1, 3, 4, 6, or 12 months.");
  }
}

export function subscriptionGracePeriodDays(value?: number | null): number {
  const days = value ?? DEFAULT_SUBSCRIPTION_GRACE_PERIOD_DAYS;
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("Grace period must be a non-negative whole number of days.");
  }
  return days;
}
