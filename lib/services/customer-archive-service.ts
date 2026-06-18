import "server-only";

import { prisma } from "@/lib/db";

import { recordOperationalEvent } from "./operational-event-service";

export type ArchiveCustomerResult =
  | { ok: true; endedAssignments: number }
  | { ok: false; error: string };

export async function archiveCustomer(
  customerId: string,
  actorUserId?: string | null,
): Promise<ArchiveCustomerResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, archivedAt: true, company: true, firstName: true, lastName: true },
  });
  if (!customer) {
    return { ok: false, error: "Customer not found." };
  }
  if (customer.archivedAt) {
    return { ok: false, error: "Customer is already archived." };
  }

  const openAssignments = await prisma.serviceAssignment.findMany({
    where: {
      customerId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: {
      id: true,
    },
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: { archivedAt: now },
    });

    for (const assignment of openAssignments) {
      await tx.serviceAssignment.update({
        where: { id: assignment.id },
        data: {
          endDate: now,
          status: "cancelled",
        },
      });
    }
  });

  const displayName =
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    customerId;

  await recordOperationalEvent({
    category: "customer.archived",
    summary:
      openAssignments.length > 0
        ? `Customer archived (${openAssignments.length} active assignment${openAssignments.length === 1 ? "" : "s"} ended)`
        : "Customer archived",
    customerId,
    actorUserId: actorUserId ?? undefined,
    payload: { displayName },
  });

  return { ok: true, endedAssignments: openAssignments.length };
}

export type UnarchiveCustomerResult = { ok: true } | { ok: false; error: string };

export async function unarchiveCustomer(
  customerId: string,
  actorUserId?: string | null,
): Promise<UnarchiveCustomerResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, archivedAt: true, company: true, firstName: true, lastName: true },
  });
  if (!customer) {
    return { ok: false, error: "Customer not found." };
  }
  if (!customer.archivedAt) {
    return { ok: false, error: "Customer is not archived." };
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { archivedAt: null },
  });

  const displayName =
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    customerId;

  await recordOperationalEvent({
    category: "customer.unarchived",
    summary: "Customer restored from archive",
    customerId,
    actorUserId: actorUserId ?? undefined,
    payload: { displayName },
  });

  return { ok: true };
}
