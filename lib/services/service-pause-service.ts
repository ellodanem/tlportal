import "server-only";

import type { DeviceStatus, ServiceAssignmentPauseReason } from "@prisma/client";

import { openAssignmentWhere } from "@/lib/domain/service-assignment-queries";
import type { ServicePauseDeviceDisposition } from "@/lib/domain/service-pause";
import { prisma } from "@/lib/db";
import { setRecurringScheduleStatus } from "@/lib/services/native-recurring-schedule-service";

import { recordOperationalEvent } from "./operational-event-service";

export type PauseServiceAssignmentInput = {
  assignmentId: string;
  reason: ServiceAssignmentPauseReason;
  note?: string | null;
  deviceDisposition: ServicePauseDeviceDisposition;
  actorUserId?: string | null;
};

export type PauseServiceAssignmentResult =
  | {
      ok: true;
      assignmentId: string;
      customerId: string;
      deviceId: string;
      pausedRecurringSchedules: number;
    }
  | { ok: false; error: string };

export type ResumeServiceAssignmentInput = {
  assignmentId: string;
  actorUserId?: string | null;
};

export type ResumeServiceAssignmentResult =
  | {
      ok: true;
      assignmentId: string;
      customerId: string;
      deviceId: string;
      restoredNextDue: Date | null;
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

  await prisma.$transaction(async (tx) => {
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
    },
  });

  return {
    ok: true,
    assignmentId: assignment.id,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    pausedRecurringSchedules,
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

  await prisma.$transaction(async (tx) => {
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
    },
  });

  return {
    ok: true,
    assignmentId: assignment.id,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    restoredNextDue,
  };
}
