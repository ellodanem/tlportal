/**
 * Trackers stay installed at the customer when an agreement ends. They must be
 * reusable on a new agreement for that same customer without appearing as stock
 * for anyone else, and without being stolen from a live service.
 */

import type { Prisma } from "@prisma/client";

export const CLOSED_SERVICE_STATUSES = ["ended", "canceled"] as const;

/** Open assignments that can join a new service: unlinked, or still sitting on an ended/canceled service. */
export const reclaimableOpenAssignmentWhere = {
  endDate: null,
  status: { not: "cancelled" },
  OR: [
    { subscriptionItemId: null },
    { subscriptionItem: { status: { in: [...CLOSED_SERVICE_STATUSES] } } },
  ],
} satisfies Prisma.ServiceAssignmentWhereInput;

export type OpenAssignmentJoinFacts = {
  assignmentCustomerId: string;
  expectedCustomerId: string;
  endDate: Date | null;
  assignmentStatus: string;
  /** Null when the assignment is not linked to a subscription item. */
  linkedItemStatus: string | null;
};

/** Null means the assignment can join this customer's new service. */
export function openAssignmentJoinBlocker(input: OpenAssignmentJoinFacts): { code: string; message: string } | null {
  if (input.endDate || input.assignmentStatus === "cancelled") {
    return { code: "ASSIGNMENT_CLOSED", message: "A closed service assignment cannot be linked." };
  }
  if (input.assignmentCustomerId !== input.expectedCustomerId) {
    return { code: "CROSS_CUSTOMER_ASSIGNMENT", message: "This tracker is installed for a different customer." };
  }
  if (!input.linkedItemStatus) return null;
  if ((CLOSED_SERVICE_STATUSES as readonly string[]).includes(input.linkedItemStatus)) return null;
  return {
    code: "ASSIGNMENT_CONFLICT",
    message: "This tracker is still on a live service. Transfer it, or end that service first.",
  };
}
