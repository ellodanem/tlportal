import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { replaceSubscriptionItemHardwareInTransaction } from "@/lib/services/canonical-subscription-application-service";

type SimDisposition = "move_current" | "select" | "none";
type HardwareDisposition = "in_stock" | "faulty_returned" | "lost";

export class DeviceAssignmentOperationError extends Error {}

function dateOnly(value: string): Date {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!value || Number.isNaN(parsed.getTime())) throw new DeviceAssignmentOperationError("Choose a valid effective date.");
  return parsed;
}

async function assertSimIsAvailable(
  tx: Prisma.TransactionClient,
  simCardId: string,
  allowedDeviceIds: string[],
): Promise<void> {
  const sim = await tx.simCard.findUnique({ where: { id: simCardId }, select: { id: true } });
  if (!sim) throw new DeviceAssignmentOperationError("Selected SIM was not found.");
  const deviceLink = await tx.device.findFirst({
    where: { simCardId, id: { notIn: allowedDeviceIds } },
    select: { id: true },
  });
  if (deviceLink) throw new DeviceAssignmentOperationError("That SIM is already linked to another device.");
  const assignmentLink = await tx.serviceAssignment.findFirst({
    where: {
      simCardId,
      endDate: null,
      status: { not: "cancelled" },
      deviceId: { notIn: allowedDeviceIds },
    },
    select: { id: true },
  });
  if (assignmentLink) throw new DeviceAssignmentOperationError("That SIM is tied to another active service assignment.");
}

/**
 * Physical hardware replacement only. It deliberately never creates invoices,
 * schedules, payments, provider updates, or commercial subscription changes.
 */
export async function replaceDeviceForExistingAssignment(input: {
  assignmentId: string;
  replacementDeviceId: string;
  effectiveDate: string;
  simDisposition: SimDisposition;
  replacementSimCardId?: string | null;
  oldHardwareDisposition: HardwareDisposition;
  reason?: string | null;
  actorUserId: string;
}) {
  const effectiveDate = dateOnly(input.effectiveDate);
  if (input.simDisposition === "select" && !input.replacementSimCardId) {
    throw new DeviceAssignmentOperationError("Select the replacement SIM or choose another SIM option.");
  }
  if (input.replacementDeviceId === "") throw new DeviceAssignmentOperationError("Choose a replacement device.");

  return prisma.$transaction(async (tx) => {
    const current = await tx.serviceAssignment.findFirst({
      where: { id: input.assignmentId, endDate: null, status: { not: "cancelled" } },
      include: { device: { select: { id: true, simCardId: true } }, customer: { select: { archivedAt: true } } },
    });
    if (!current) throw new DeviceAssignmentOperationError("The current installation is no longer active.");
    if (current.customer.archivedAt) throw new DeviceAssignmentOperationError("Restore the customer before replacing hardware.");
    if (current.deviceId === input.replacementDeviceId) {
      throw new DeviceAssignmentOperationError("Choose a different device for the replacement.");
    }
    if (current.startDate && effectiveDate < current.startDate) {
      throw new DeviceAssignmentOperationError("Replacement cannot predate the current installation.");
    }

    const replacement = await tx.device.findUnique({
      where: { id: input.replacementDeviceId },
      select: { id: true, status: true, condition: true, simCardId: true },
    });
    if (!replacement) throw new DeviceAssignmentOperationError("Replacement device was not found.");
    if (replacement.status !== "in_stock" || replacement.condition === "faulty") {
      throw new DeviceAssignmentOperationError("Replacement device must be a sound in-stock device.");
    }
    const openReplacementAssignment = await tx.serviceAssignment.findFirst({
      where: { deviceId: replacement.id, endDate: null, status: { not: "cancelled" } },
      select: { id: true },
    });
    if (openReplacementAssignment) throw new DeviceAssignmentOperationError("Replacement device is already installed.");

    const nextSimId = input.simDisposition === "move_current"
      ? current.device.simCardId
      : input.simDisposition === "select"
        ? input.replacementSimCardId!
        : null;
    if (nextSimId) await assertSimIsAvailable(tx, nextSimId, [current.deviceId, replacement.id]);

    const created = await tx.serviceAssignment.create({
      data: {
        customerId: current.customerId,
        deviceId: replacement.id,
        simCardId: nextSimId,
        status: current.status,
        intervalMonths: current.intervalMonths,
        invoilessRecurringId: current.invoilessRecurringId,
        lastInvoiceId: current.lastInvoiceId,
        lastPaymentStatus: current.lastPaymentStatus,
        nextDueDate: current.nextDueDate,
        notes: current.notes,
        pausedAt: current.pausedAt,
        pauseReason: current.pauseReason,
        pauseNote: current.pauseNote,
        frozenNextDueDate: current.frozenNextDueDate,
        resumedAt: current.resumedAt,
      },
      select: { id: true },
    });

    if (current.subscriptionItemId) {
      await replaceSubscriptionItemHardwareInTransaction(tx, {
        subscriptionItemId: current.subscriptionItemId,
        replacementAssignmentId: created.id,
        replacedOn: input.effectiveDate,
      });
    } else {
      await tx.serviceAssignment.update({
        where: { id: current.id },
        data: { endDate: effectiveDate, status: "cancelled" },
      });
      await tx.serviceAssignment.update({
        where: { id: created.id },
        data: { startDate: effectiveDate },
      });
    }

    await tx.device.update({ where: { id: replacement.id }, data: { status: "assigned", simCardId: nextSimId } });
    await tx.device.update({
      where: { id: current.deviceId },
      data: input.oldHardwareDisposition === "lost"
        ? { status: "lost", simCardId: null }
        : input.oldHardwareDisposition === "faulty_returned"
          ? { status: "returned", condition: "faulty", simCardId: null }
          : { status: "in_stock", simCardId: null },
    });
    await tx.operationalEvent.create({
      data: {
        category: "assignment.hardware_replaced",
        summary: "Device hardware replaced without changing commercial terms",
        customerId: current.customerId,
        deviceId: replacement.id,
        actorUserId: input.actorUserId,
        payload: {
          previousAssignmentId: current.id,
          replacementAssignmentId: created.id,
          previousDeviceId: current.deviceId,
          replacementDeviceId: replacement.id,
          subscriptionItemId: current.subscriptionItemId,
          previousSimCardId: current.device.simCardId,
          nextSimCardId: nextSimId,
          effectiveDate: input.effectiveDate,
          oldHardwareDisposition: input.oldHardwareDisposition,
          reason: input.reason?.trim() || null,
        },
      },
    });
    return { customerId: current.customerId, previousDeviceId: current.deviceId, replacementDeviceId: replacement.id, previousSimId: current.device.simCardId, nextSimId, assignmentId: created.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Transactional SIM-only mutation. No service, billing, or provider fields change. */
export async function changeDeviceSim(input: { deviceId: string; nextSimCardId: string | null; actorUserId: string; reason?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({ where: { id: input.deviceId }, select: { id: true, status: true, simCardId: true } });
    if (!device) throw new DeviceAssignmentOperationError("Device not found.");
    if (["decommissioned", "lost"].includes(device.status)) throw new DeviceAssignmentOperationError("Cannot change SIM on a decommissioned or lost device.");
    if (device.simCardId === input.nextSimCardId) throw new DeviceAssignmentOperationError("That SIM is already linked to this device.");
    const assignment = await tx.serviceAssignment.findFirst({ where: { deviceId: device.id, endDate: null, status: { not: "cancelled" } }, select: { id: true, customerId: true } });
    if (input.nextSimCardId) await assertSimIsAvailable(tx, input.nextSimCardId, [device.id]);
    await tx.device.update({ where: { id: device.id }, data: { simCardId: input.nextSimCardId } });
    if (assignment) await tx.serviceAssignment.update({ where: { id: assignment.id }, data: { simCardId: input.nextSimCardId } });
    await tx.operationalEvent.create({ data: { category: input.nextSimCardId ? "sim.swapped" : "sim.unlinked", summary: input.nextSimCardId ? "SIM changed on device; commercial terms unchanged" : "SIM unlinked from device; commercial terms unchanged", customerId: assignment?.customerId, deviceId: device.id, actorUserId: input.actorUserId, payload: { previousSimId: device.simCardId, nextSimId: input.nextSimCardId, assignmentId: assignment?.id ?? null, reason: input.reason?.trim() || null } } });
    return { previousSimId: device.simCardId, nextSimId: input.nextSimCardId, customerId: assignment?.customerId ?? null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
