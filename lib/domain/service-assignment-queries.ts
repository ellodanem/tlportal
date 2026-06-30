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
