import "server-only";

import { prisma } from "@/lib/db";
import {
  CANONICAL_CUSTOMER_OWNED_ERROR,
  CANONICAL_SCHEDULE_OWNED_ERROR,
  customerHasCanonicalAuthority,
  isCanonicalOwnedSchedule,
} from "@/lib/domain/canonical-ownership";
import { CANONICAL_ASSIGNMENT_RENEWAL_ERROR } from "@/lib/domain/service-assignment-queries";

export async function scheduleIsCanonicalOwned(scheduleId: string): Promise<boolean> {
  const schedule = await prisma.recurringInvoiceSchedule.findUnique({
    where: { id: scheduleId },
    select: { customerSubscription: { select: { controlMode: true } } },
  });
  return isCanonicalOwnedSchedule(schedule);
}

/** Throws when the schedule is derived from a canonical subscription. Missing schedules pass through. */
export async function assertScheduleNotCanonicalOwned(scheduleId: string): Promise<void> {
  const schedule = await prisma.recurringInvoiceSchedule.findUnique({
    where: { id: scheduleId },
    select: { customerSubscription: { select: { controlMode: true } } },
  });
  if (isCanonicalOwnedSchedule(schedule)) throw new Error(CANONICAL_SCHEDULE_OWNED_ERROR);
}

/** Throws when a new schedule would be attached to a canonical-linked assignment. */
export async function assertAssignmentNotCanonical(assignmentId: string | null | undefined): Promise<void> {
  if (!assignmentId) return;
  const assignment = await prisma.serviceAssignment.findFirst({
    where: { id: assignmentId, subscriptionItemId: { not: null } },
    select: { id: true },
  });
  if (assignment) throw new Error(CANONICAL_ASSIGNMENT_RENEWAL_ERROR);
}

export async function customerHasCanonicalSubscription(customerId: string): Promise<boolean> {
  const subscriptions = await prisma.customerSubscription.findMany({
    where: { customerId, controlMode: "canonical" },
    select: { controlMode: true, lifecycleStatus: true },
  });
  return customerHasCanonicalAuthority(subscriptions);
}

/** Throws when legacy customer-level billing setup would compete with canonical authority. */
export async function assertCustomerNotCanonicalManaged(customerId: string): Promise<void> {
  if (await customerHasCanonicalSubscription(customerId)) throw new Error(CANONICAL_CUSTOMER_OWNED_ERROR);
}
