import type { Prisma } from "@prisma/client";

/** Open assignment: not ended; includes active and suspended. */
export const openAssignmentWhere = {
  endDate: null,
  status: { not: "cancelled" as const },
} satisfies Prisma.ServiceAssignmentWhereInput;

/** Billable / live service: active only (excludes suspended). */
export const billableAssignmentWhere = {
  endDate: null,
  status: "active" as const,
} satisfies Prisma.ServiceAssignmentWhereInput;

/**
 * Legacy renewal bookkeeping (next due, billing term, mark paid, Stripe advance) applies only to
 * assignments that are NOT represented by a canonical subscription service. Canonical-linked
 * assignments carry `subscriptionItemId`; their dates and prices belong to the subscription.
 */
export const legacyRenewalAssignmentWhere = {
  ...billableAssignmentWhere,
  subscriptionItemId: null,
} satisfies Prisma.ServiceAssignmentWhereInput;

export const CANONICAL_ASSIGNMENT_RENEWAL_ERROR =
  "This service belongs to a canonical subscription. Change its price, dates or lifecycle from the subscription's Services page.";

/**
 * Active assignments billed on the customer's Stripe subscription track:
 * term must match `CustomerSubscription.planTermMonths` (or Stripe price interval).
 * Other-term / unset-term devices stay on Device renewals only.
 */
export function stripeTrackAssignmentWhere(
  planTermMonths: number,
): Prisma.ServiceAssignmentWhereInput {
  return {
    ...billableAssignmentWhere,
    intervalMonths: Math.max(1, Math.trunc(planTermMonths)),
  };
}
