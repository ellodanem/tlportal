import "server-only";

import type { DeviceStatus, ServiceAssignmentPauseReason } from "@prisma/client";

import { openAssignmentWhere } from "@/lib/domain/service-assignment-queries";
import type { ServicePauseDeviceDisposition } from "@/lib/domain/service-pause";
import { prisma } from "@/lib/db";
import { syncCanonicalScheduleLinesForItem } from "@/lib/services/canonical-schedule-line-sync-service";
import { setRecurringScheduleStatus } from "@/lib/services/native-recurring-schedule-service";

import { recordOperationalEvent } from "./operational-event-service";

export type PauseServiceAssignmentInput = {
  assignmentId: string;
  reason: ServiceAssignmentPauseReason;
  note?: string | null;
  deviceDisposition: ServicePauseDeviceDisposition;
  actorUserId?: string | null;
  /**
   * Also pause the subscription service the assignment belongs to, in the same transaction, so it
   * drops out of the next renewal. Left off by the vehicle-sold flow, which ends billing by date.
   */
  pauseSubscriptionItem?: boolean;
};

export type PauseServiceAssignmentResult =
  | {
      ok: true;
      assignmentId: string;
      customerId: string;
      deviceId: string;
      pausedRecurringSchedules: number;
      subscriptionItemPaused: boolean;
    }
  | { ok: false; error: string };

export type ResumeServiceAssignmentInput = {
  assignmentId: string;
  actorUserId?: string | null;
  /** Also return a paused subscription service to active in the same transaction. */
  resumeSubscriptionItem?: boolean;
};

export type ResumeServiceAssignmentResult =
  | {
      ok: true;
      assignmentId: string;
      customerId: string;
      deviceId: string;
      restoredNextDue: Date | null;
      subscriptionItemResumed: boolean;
    }
  | { ok: false; error: string };

function deviceStatusForDisposition(disposition: ServicePauseDeviceDisposition): DeviceStatus {
  return disposition === "in_stock" ? "in_stock" : "returned";
}

async function pauseRecurringSchedulesForAssignment(assignmentId: string): Promise<number> {
  const schedules = await prisma.recurringInvoiceSchedule.findMany({
    where: {
      serviceAssignmentId: assignmentId,
      status: "active",
      // Canonical schedules belong to the whole subscription; pausing one service never pauses them.
      OR: [{ customerSubscriptionId: null }, { customerSubscription: { controlMode: { not: "canonical" } } }],
    },
    select: { id: true },
  });

  for (const s of schedules) {
    await setRecurringScheduleStatus(s.id, "paused");
  }

  return schedules.length;
}

export async function pauseServiceAssignment(
  input: PauseServiceAssignmentInput,
): Promise<PauseServiceAssignmentResult> {
  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      id: input.assignmentId,
      ...openAssignmentWhere,
    },
    include: {
      device: { select: { id: true, status: true, imei: true, label: true } },
      customer: { select: { id: true, archivedAt: true } },
    },
  });

  if (!assignment) {
    return { ok: false, error: "Open assignment not found." };
  }
  if (assignment.status === "suspended") {
    return { ok: false, error: "Service is already paused." };
  }
  if (assignment.customer.archivedAt) {
    return { ok: false, error: "Cannot pause service for an archived customer." };
  }
  if (assignment.device.status === "decommissioned" || assignment.device.status === "lost") {
    return { ok: false, error: "Cannot pause service on a decommissioned or lost device." };
  }

  const note = input.note?.trim() || null;
  const now = new Date();
  const deviceStatus = deviceStatusForDisposition(input.deviceDisposition);

  const subscriptionItemPaused = await prisma.$transaction(async (tx) => {
    await tx.serviceAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "suspended",
        pausedAt: now,
        pauseReason: input.reason,
        pauseNote: note,
        frozenNextDueDate: assignment.nextDueDate,
        resumedAt: null,
      },
    });
    await tx.device.update({
      where: { id: assignment.deviceId },
      data: { status: deviceStatus },
    });
    if (!input.pauseSubscriptionItem || !assignment.subscriptionItemId) return false;
    // Only a billing service can be paused; drafts and pending services are not billed yet.
    const paused = await tx.subscriptionItem.updateMany({
      where: { id: assignment.subscriptionItemId, status: "active" },
      data: { status: "paused" },
    });
    if (paused.count > 0) await syncCanonicalScheduleLinesForItem(tx, assignment.subscriptionItemId);
    return paused.count > 0;
  });

  const pausedRecurringSchedules = await pauseRecurringSchedulesForAssignment(assignment.id);

  const deviceLabel =
    assignment.device.label?.trim() || assignment.device.imei || assignment.device.id.slice(0, 8);

  await recordOperationalEvent({
    category: "assignment.paused",
    summary: `Service paused — ${deviceLabel}`,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    actorUserId: input.actorUserId ?? undefined,
    payload: {
      assignmentId: assignment.id,
      reason: input.reason,
      note,
      deviceDisposition: input.deviceDisposition,
      frozenNextDueDate: assignment.nextDueDate?.toISOString() ?? null,
      pausedRecurringSchedules,
      subscriptionItemPaused,
    },
  });

  return {
    ok: true,
    assignmentId: assignment.id,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    pausedRecurringSchedules,
    subscriptionItemPaused,
  };
}

export async function resumeServiceAssignment(
  input: ResumeServiceAssignmentInput,
): Promise<ResumeServiceAssignmentResult> {
  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      id: input.assignmentId,
      ...openAssignmentWhere,
      status: "suspended",
    },
    include: {
      device: { select: { id: true, status: true, imei: true, label: true } },
      customer: { select: { id: true, archivedAt: true } },
    },
  });

  if (!assignment) {
    return { ok: false, error: "Paused assignment not found." };
  }
  if (assignment.customer.archivedAt) {
    return { ok: false, error: "Cannot resume service for an archived customer." };
  }
  if (assignment.device.status === "decommissioned" || assignment.device.status === "lost") {
    return { ok: false, error: "Cannot resume service on a decommissioned or lost device." };
  }

  const now = new Date();
  const restoredNextDue = assignment.frozenNextDueDate ?? assignment.nextDueDate;

  const subscriptionItemResumed = await prisma.$transaction(async (tx) => {
    await tx.serviceAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "active",
        resumedAt: now,
        nextDueDate: restoredNextDue,
        pausedAt: null,
        pauseReason: null,
        pauseNote: null,
        frozenNextDueDate: null,
      },
    });
    await tx.device.update({
      where: { id: assignment.deviceId },
      data: { status: "assigned" },
    });
    if (!input.resumeSubscriptionItem || !assignment.subscriptionItemId) return false;
    const resumed = await tx.subscriptionItem.updateMany({
      where: { id: assignment.subscriptionItemId, status: "paused" },
      data: { status: "active" },
    });
    if (resumed.count > 0) await syncCanonicalScheduleLinesForItem(tx, assignment.subscriptionItemId);
    return resumed.count > 0;
  });

  const deviceLabel =
    assignment.device.label?.trim() || assignment.device.imei || assignment.device.id.slice(0, 8);

  await recordOperationalEvent({
    category: "assignment.resumed",
    summary: `Service resumed — ${deviceLabel}`,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    actorUserId: input.actorUserId ?? undefined,
    payload: {
      assignmentId: assignment.id,
      restoredNextDueDate: restoredNextDue?.toISOString() ?? null,
      subscriptionItemResumed,
    },
  });

  return {
    ok: true,
    assignmentId: assignment.id,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    restoredNextDue,
    subscriptionItemResumed,
  };
}
