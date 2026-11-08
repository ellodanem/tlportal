import { addDays, addMonthsClamped } from "@/lib/domain/subscription-proration";

/**
 * Renewal bookkeeping for Stripe subscriptions that were adopted into the
 * canonical model while canonical Stripe *execution* is still disabled.
 *
 * Stripe collects the money; TL Portal only records it. This module decides,
 * from a paid invoice's covered period, whether the subscription's next billing
 * date should move forward. It is pure so the rule is easy to test, and it is
 * idempotent: applying the same invoice twice never advances twice.
 */

/** Stripe period timestamps drift by hours around the renewal day; tolerate a few days. */
export const ADOPTED_RENEWAL_TOLERANCE_DAYS = 4;

export type AdoptedRenewalDecision =
  | { action: "advance"; nextBillingDate: string }
  /** Nothing to do, and nothing wrong (already applied, or a later period waiting its turn). */
  | { action: "noop"; reason: "already_applied" | "later_period" }
  /** Do not guess: surface to staff instead of moving a date. */
  | { action: "review"; reason: string };

export type AdoptedRenewalInput = {
  /** Subscription's current renewal date, YYYY-MM-DD (UTC). */
  currentNextBillingDate: string | null;
  billingIntervalMonths: number | null;
  /** Period the paid Stripe invoice covers, YYYY-MM-DD (UTC). */
  invoicePeriodStart: string | null;
  invoicePeriodEnd: string | null;
};

export function decideAdoptedRenewalAdvance(input: AdoptedRenewalInput): AdoptedRenewalDecision {
  const { currentNextBillingDate: current, billingIntervalMonths: interval, invoicePeriodStart: start, invoicePeriodEnd: end } = input;

  if (!current) return { action: "review", reason: "The subscription has no next billing date." };
  if (!interval || interval <= 0) return { action: "review", reason: "The subscription has no billing cadence." };
  if (!start || !end) return { action: "review", reason: "The paid Stripe invoice has no billing period." };
  if (end <= start) return { action: "review", reason: "The paid Stripe invoice period is empty or reversed." };

  // This invoice (or a later one) already moved the date to or past its period end.
  if (end <= current) return { action: "noop", reason: "already_applied" };

  // A later cycle's invoice arrived before the earlier one was applied. Leave it:
  // the daily catch-up applies invoices oldest-first, so it will be picked up.
  if (start > addDays(current, ADOPTED_RENEWAL_TOLERANCE_DAYS)) return { action: "noop", reason: "later_period" };

  // The invoice covers the current renewal. It must pay roughly one cadence; anything
  // longer (prepaid, mis-set cadence) needs a person, not an automatic jump.
  const latestSensibleEnd = addDays(addMonthsClamped(current, interval), ADOPTED_RENEWAL_TOLERANCE_DAYS);
  if (end > latestSensibleEnd) {
    return { action: "review", reason: `The paid period ends ${end}, more than one ${interval}-month cycle after ${current}.` };
  }

  return { action: "advance", nextBillingDate: end };
}

/** UTC calendar day of a timestamp, as YYYY-MM-DD. */
export function utcDayString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
