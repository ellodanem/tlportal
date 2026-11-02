import "server-only";

import { Prisma } from "@prisma/client";

import {
  appendNote,
  assetLossNote,
  ASSET_LOSS_REASON_LABEL,
  type AssetLossReason,
} from "@/lib/domain/asset-loss";
import { openAssignmentWhere } from "@/lib/domain/service-assignment-queries";
import { prisma } from "@/lib/db";
import { scheduleSubscriptionItemEndInTransaction } from "@/lib/services/canonical-subscription-application-service";

export class AssetLossError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetLossError";
  }
}

type AssetLossBase = {
  assignmentId: string;
  /** `YYYY-MM-DD` date the asset was lost; billing and the installation end on this date. */
  lossDate: string;
  reason: AssetLossReason;
  note?: string | null;
  actorUserId?: string | null;
};

export type CanonicalAssetLossInput = AssetLossBase & {
  subscriptionId: string;
  subscriptionItemId: string;
};

export type OpenInvoiceAfterLoss = {
  id: string;
  number: string | null;
  amountDue: string;
  currency: string;
};

export type AssetLossResult = {
  customerId: string;
  deviceId: string;
  assignmentId: string;
  previousSimId: string | null;
  endedRecurringSchedules: number;
  openInvoices: OpenInvoiceAfterLoss[];
};

const UNPAID_INVOICE_STATUSES = ["draft", "open", "partially_paid", "overdue"] as const;

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AssetLossError("Choose the date the asset was lost.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AssetLossError("The loss date must be a valid calendar date.");
  }
  return date;
}

/**
 * Core of the workflow, run inside the caller's transaction so billing end, installation end and
 * the device write-off either all happen or none do.
 */
async function applyAssetLoss(
  tx: Prisma.TransactionClient,
  input: AssetLossBase & { eventCategory: string; eventPayload: Record<string, Prisma.InputJsonValue | null> },
  expected: { subscriptionItemId: string | null },
): Promise<Omit<AssetLossResult, "openInvoices"> & { endedScheduleIds: string[] }> {
  const lossDate = parseDate(input.lossDate);

  const assignment = await tx.serviceAssignment.findFirst({
    where: { id: input.assignmentId, ...openAssignmentWhere },
    include: {
      device: { select: { id: true, status: true, imei: true, label: true, notes: true, simCardId: true } },
    },
  });
  if (!assignment) throw new AssetLossError("This tracker installation is no longer open.");
  if ((assignment.subscriptionItemId ?? null) !== expected.subscriptionItemId) {
    throw new AssetLossError(
      expected.subscriptionItemId
        ? "The tracker assignment does not belong to this subscription service."
        : "This installation belongs to a canonical subscription service. Record the loss from that subscription's service page so billing ends with it.",
    );
  }
  if (assignment.device.status === "lost" || assignment.device.status === "decommissioned") {
    throw new AssetLossError("This device is already marked lost or decommissioned.");
  }
  if (assignment.startDate && lossDate < assignment.startDate) {
    throw new AssetLossError("The loss date cannot be before the installation start date.");
  }

  const note = assetLossNote({ reason: input.reason, lossDate: input.lossDate, note: input.note });

  await tx.serviceAssignment.update({
    where: { id: assignment.id },
    data: { endDate: lossDate, status: "cancelled", notes: appendNote(assignment.notes, note) },
  });
  await tx.device.update({
    where: { id: assignment.deviceId },
    data: { status: "lost", simCardId: null, notes: appendNote(assignment.device.notes, note) },
  });

  // Legacy per-assignment invoice schedules end for good. Canonical agreements own their schedule,
  // and it stops via the subscription item end date instead.
  const schedules = await tx.recurringInvoiceSchedule.findMany({
    where: {
      serviceAssignmentId: assignment.id,
      status: { not: "ended" },
      OR: [{ customerSubscriptionId: null }, { customerSubscription: { controlMode: { not: "canonical" } } }],
    },
    select: { id: true },
  });
  const endedScheduleIds = schedules.map((s) => s.id);
  if (endedScheduleIds.length) {
    await tx.recurringInvoiceSchedule.updateMany({
      where: { id: { in: endedScheduleIds } },
      data: { status: "ended" },
    });
  }

  const deviceLabel = assignment.device.label?.trim() || assignment.device.imei;
  await tx.operationalEvent.create({
    data: {
      category: input.eventCategory,
      summary: `Asset lost (${ASSET_LOSS_REASON_LABEL[input.reason]}) — ${deviceLabel} written off, service ended ${input.lossDate}`,
      customerId: assignment.customerId,
      deviceId: assignment.deviceId,
      actorUserId: input.actorUserId ?? undefined,
      payload: {
        assignmentId: assignment.id,
        reason: input.reason,
        lossDate: input.lossDate,
        note: input.note?.trim() || null,
        previousSimCardId: assignment.device.simCardId,
        endedRecurringSchedules: endedScheduleIds,
        ...input.eventPayload,
      } as Prisma.InputJsonObject,
    },
  });

  return {
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    assignmentId: assignment.id,
    previousSimId: assignment.device.simCardId,
    endedRecurringSchedules: endedScheduleIds.length,
    endedScheduleIds,
  };
}

/** Invoices that may still bill the lost asset; staff void or write them off manually. */
async function findOpenInvoicesAfterLoss(input: {
  customerId: string;
  lossDate: Date;
  subscriptionId?: string;
  assignmentId: string;
  scheduleIds: string[];
}): Promise<OpenInvoiceAfterLoss[]> {
  const attribution: Prisma.InvoiceWhereInput[] = input.subscriptionId
    ? [{ customerSubscriptionId: input.subscriptionId }]
    : [{ serviceAssignmentId: input.assignmentId }, ...(input.scheduleIds.length ? [{ recurringScheduleId: { in: input.scheduleIds } }] : [])];
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId: input.customerId,
      status: { in: [...UNPAID_INVOICE_STATUSES] },
      archivedAt: null,
      issueDate: { gte: input.lossDate },
      OR: attribution,
    },
    orderBy: { issueDate: "asc" },
    select: { id: true, number: true, amountDue: true, currency: true },
  });
  return invoices.map((i) => ({ id: i.id, number: i.number, amountDue: i.amountDue.toString(), currency: i.currency }));
}

/** Loss on a canonical subscription service: ends billing, the installation and writes off the device. */
export async function recordCanonicalAssetLoss(input: CanonicalAssetLossInput): Promise<AssetLossResult> {
  const applied = await prisma.$transaction(async (tx) => {
    await scheduleSubscriptionItemEndInTransaction(tx, {
      subscriptionItemId: input.subscriptionItemId,
      effectiveUntil: input.lossDate,
    });
    return applyAssetLoss(
      tx,
      {
        ...input,
        eventCategory: "subscription.asset_lost",
        eventPayload: { subscriptionId: input.subscriptionId, subscriptionItemId: input.subscriptionItemId },
      },
      { subscriptionItemId: input.subscriptionItemId },
    );
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const openInvoices = await findOpenInvoicesAfterLoss({
    customerId: applied.customerId,
    lossDate: parseDate(input.lossDate),
    subscriptionId: input.subscriptionId,
    assignmentId: applied.assignmentId,
    scheduleIds: applied.endedScheduleIds,
  });
  return toResult(applied, openInvoices);
}

function toResult(
  applied: Omit<AssetLossResult, "openInvoices"> & { endedScheduleIds: string[] },
  openInvoices: OpenInvoiceAfterLoss[],
): AssetLossResult {
  return {
    customerId: applied.customerId,
    deviceId: applied.deviceId,
    assignmentId: applied.assignmentId,
    previousSimId: applied.previousSimId,
    endedRecurringSchedules: applied.endedRecurringSchedules,
    openInvoices,
  };
}

/** Loss on a legacy (non-canonical) installation. */
export async function recordLegacyAssetLoss(input: AssetLossBase): Promise<AssetLossResult> {
  const applied = await prisma.$transaction(
    (tx) => applyAssetLoss(tx, { ...input, eventCategory: "assignment.asset_lost", eventPayload: {} }, { subscriptionItemId: null }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  const openInvoices = await findOpenInvoicesAfterLoss({
    customerId: applied.customerId,
    lossDate: parseDate(input.lossDate),
    assignmentId: applied.assignmentId,
    scheduleIds: applied.endedScheduleIds,
  });
  return toResult(applied, openInvoices);
}

export function formatOpenInvoicesNotice(invoices: OpenInvoiceAfterLoss[]): string {
  if (!invoices.length) return "";
  const labels = invoices.slice(0, 5).map((i) => i.number ?? "draft").join(", ");
  const more = invoices.length > 5 ? ` and ${invoices.length - 5} more` : "";
  return ` ${invoices.length} unpaid invoice${invoices.length === 1 ? "" : "s"} dated on or after the loss date still need review (${labels}${more}); void or write them off from TL Invoices if they should not be collected.`;
}
