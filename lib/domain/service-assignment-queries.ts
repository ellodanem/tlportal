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
