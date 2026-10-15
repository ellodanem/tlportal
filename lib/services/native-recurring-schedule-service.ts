import "server-only";

import type { RecurringScheduleStatus } from "@prisma/client";

import { sendNativeInvoiceEmail } from "@/lib/billing/send-native-invoice-email";
import {
  coordinateRecurringInvoiceGeneration,
  type RecurringInvoiceCommitResult,
  type RecurringInvoiceGenerationResult,
} from "@/lib/billing/recurring-invoice-coordinator";
import {
  addUtcDays,
  nextRecurringScheduleDate,
  recurringGenerationKey,
  startOfUtcDay,
} from "@/lib/billing/recurring-period";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";
import {
  computeLineTotal,
  toMoneyString,
  toQtyString,
} from "@/lib/domain/native-billing";
import type { NativeLineInput } from "@/lib/services/native-invoice-service";
import {
  createDraftInvoiceInTransaction,
  finalizeInvoiceInTransaction,
} from "@/lib/services/native-invoice-service";
import {
  canonicalRecurringGenerationKey,
  persistCanonicalInvoiceSnapshots,
  resolveCanonicalScheduleBillingCycle,
  type CanonicalScheduleBillingCycle,
} from "@/lib/services/canonical-native-billing-service";

export type RecurringScheduleLineInput = NativeLineInput;

export type CreateRecurringScheduleInput = {
  name?: string | null;
  customerId?: string | null;
  billToName?: string | null;
  billToLines?: string[];
  currency?: string;
  taxLabel?: string | null;
  taxRatePercent?: number | null;
  notes?: string | null;
  paymentInstructions?: string | null;
  intervalMonths: number;
  nextIssueDate: Date;
  dueDaysAfterIssue?: number;
  autoEmail?: boolean;
  emailTo?: string | null;
  serviceAssignmentId?: string | null;
  createdById?: string | null;
  lineItems: RecurringScheduleLineInput[];
};

const ALLOWED_INTERVALS = new Set([1, 3, 6, 12]);
const MAX_CATCHUP_PER_RUN = 12;
const DELIVERY_RETRY_LIMIT = 25;
const DELIVERY_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

function lineCreateData(lines: RecurringScheduleLineInput[]) {
  return lines.map((line, index) => ({
    sortOrder: line.sortOrder ?? index,
    description: line.description,
    quantity: toQtyString(line.quantity),
    unitLabel: line.unitLabel ?? null,
    unitPrice: toMoneyString(line.unitPrice),
    lineTotal: toMoneyString(computeLineTotal(line.quantity, line.unitPrice)),
  }));
}

function validateScheduleInput(input: CreateRecurringScheduleInput): void {
  if (!input.lineItems.length) throw new Error("A schedule needs at least one line item.");
  if (!ALLOWED_INTERVALS.has(input.intervalMonths)) {
    throw new Error("Interval must be 1, 3, 6, or 12 months.");
  }
  const billTo = input.billToLines ?? [];
  if (!input.customerId && !billTo.length && !input.billToName?.trim()) {
    throw new Error("Choose a customer or enter bill-to details.");
  }
}

export async function createRecurringSchedule(input: CreateRecurringScheduleInput): Promise<string> {
  validateScheduleInput(input);
  const currency = (input.currency ?? "XCD").toUpperCase();

  const created = await prisma.recurringInvoiceSchedule.create({
    data: {
      status: "active",
      name: input.name ?? null,
      customerId: input.customerId ?? null,
      billToName: input.billToName ?? null,
      billToLines: input.billToLines ?? [],
      currency,
      taxLabel: input.taxLabel ?? null,
      taxRatePercent: input.taxRatePercent != null ? input.taxRatePercent.toFixed(2) : null,
      notes: input.notes ?? null,
      paymentInstructions: input.paymentInstructions ?? null,
      intervalMonths: input.intervalMonths,
      nextIssueDate: input.nextIssueDate,
      dueDaysAfterIssue: input.dueDaysAfterIssue ?? 30,
      autoEmail: input.autoEmail ?? true,
      emailTo: input.emailTo ?? null,
      serviceAssignmentId: input.serviceAssignmentId ?? null,
      createdById: input.createdById ?? null,
      lineItems: { create: lineCreateData(input.lineItems) },
    },
    select: { id: true },
  });

  return created.id;
}

export async function updateRecurringSchedule(
  scheduleId: string,
  input: CreateRecurringScheduleInput,
): Promise<void> {
  validateScheduleInput(input);

  const existing = await prisma.recurringInvoiceSchedule.findUnique({
    where: { id: scheduleId },
    select: { status: true },
  });
  if (!existing) throw new Error("Schedule not found.");
  if (existing.status === "ended") throw new Error("Ended schedules cannot be edited.");

  const currency = (input.currency ?? "XCD").toUpperCase();

  await prisma.$transaction(async (tx) => {
    await tx.recurringScheduleLineItem.deleteMany({ where: { scheduleId } });
    await tx.recurringInvoiceSchedule.update({
      where: { id: scheduleId },
      data: {
        name: input.name ?? null,
        customerId: input.customerId ?? null,
        billToName: input.billToName ?? null,
        billToLines: input.billToLines ?? [],
        currency,
        taxLabel: input.taxLabel ?? null,
        taxRatePercent: input.taxRatePercent != null ? input.taxRatePercent.toFixed(2) : null,
        notes: input.notes ?? null,
        paymentInstructions: input.paymentInstructions ?? null,
        intervalMonths: input.intervalMonths,
        nextIssueDate: input.nextIssueDate,
        dueDaysAfterIssue: input.dueDaysAfterIssue ?? 30,
        autoEmail: input.autoEmail ?? true,
        emailTo: input.emailTo ?? null,
        serviceAssignmentId: input.serviceAssignmentId ?? null,
        lineItems: { create: lineCreateData(input.lineItems) },
      },
    });
  });
}

export async function setRecurringScheduleStatus(
  scheduleId: string,
  status: RecurringScheduleStatus,
): Promise<void> {
  await prisma.recurringInvoiceSchedule.update({
    where: { id: scheduleId },
    data: { status },
  });
}

function resolveRecipientEmail(schedule: {
  emailTo: string | null;
  billToName: string | null;
  billToLines: string[];
  customerId: string | null;
  customer: { email: string | null; company: string | null; firstName: string | null; lastName: string | null } | null;
}): { to: string | null; greetingName: string } {
  const to = schedule.emailTo?.trim() || schedule.customer?.email?.trim() || null;
  const greetingName = schedule.customer
    ? customerDisplayName(schedule.customer)
    : schedule.billToName?.trim() || (schedule.billToLines[0] ?? "there");
  return { to, greetingName };
}

function deliveryClaimIsStale(claimedAt: Date | null, now: Date): boolean {
  return claimedAt == null || claimedAt.getTime() <= now.getTime() - DELIVERY_CLAIM_TIMEOUT_MS;
}

function canClaimDelivery(input: {
  autoEmail: boolean;
  sentAt: Date | null;
  status: "sending" | "sent" | "failed" | "not_requested" | null;
  claimedAt: Date | null;
  now: Date;
}): boolean {
  if (!input.autoEmail || input.sentAt || input.status === "sent" || input.status === "not_requested") {
    return false;
  }
  return input.status == null
    || input.status === "failed"
    || input.status === "sending" && deliveryClaimIsStale(input.claimedAt, input.now);
}

async function commitRecurringInvoicePeriod(
  scheduleId: string,
  asOf: Date,
  options?: { force?: boolean; skipIfNoLongerDue?: boolean },
): Promise<RecurringInvoiceCommitResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "RecurringInvoiceSchedule"
      WHERE "id" = ${scheduleId}
      FOR UPDATE
    `;
    if (!locked.length) throw new Error("Schedule not found.");

    const schedule = await tx.recurringInvoiceSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        customerSubscription: { select: { id: true, controlMode: true } },
        customer: {
          select: { email: true, company: true, firstName: true, lastName: true },
        },
      },
    });
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status !== "active") throw new Error("Schedule is not active.");
    if (!options?.force && schedule.nextIssueDate > asOf) {
      if (options?.skipIfNoLongerDue) return { kind: "not_due" };
      throw new Error("Schedule is not due yet.");
    }

    const issueDate = options?.force ? startOfUtcDay(asOf) : schedule.nextIssueDate;
    const periodStart = startOfUtcDay(issueDate);
    const periodEnd = addUtcDays(periodStart, 1);
    const canonicalCycle: CanonicalScheduleBillingCycle | null =
      schedule.customerSubscription?.controlMode === "canonical"
        ? await resolveCanonicalScheduleBillingCycle(tx, {
            scheduleId: schedule.id,
            periodStart,
          })
        : null;
    const generationKey = canonicalCycle
      ? canonicalRecurringGenerationKey(canonicalCycle.subscriptionId, issueDate)
      : recurringGenerationKey(schedule.id, issueDate);
    const claimNow = new Date();

    let existing = await tx.invoice.findUnique({
      where: { recurringGenerationKey: generationKey },
      select: {
        id: true,
        recurringScheduleId: true,
        customerSubscriptionId: true,
        sentAt: true,
        recurringDeliveryStatus: true,
        recurringDeliveryClaimedAt: true,
        recurringDeliveryAttempts: true,
      },
    });

    // Compatibility guard for invoices generated before the period key existed.
    existing ??= await tx.invoice.findFirst({
      where: {
        kind: "recurring",
        recurringScheduleId: schedule.id,
        issueDate: { gte: periodStart, lt: periodEnd },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        recurringScheduleId: true,
        customerSubscriptionId: true,
        sentAt: true,
        recurringDeliveryStatus: true,
        recurringDeliveryClaimedAt: true,
        recurringDeliveryAttempts: true,
      },
    });

    const recipient = resolveRecipientEmail(schedule);
    const advancedDate = nextRecurringScheduleDate(
      schedule.nextIssueDate,
      issueDate,
      schedule.intervalMonths,
    );

    if (existing) {
      const belongsToCanonicalSubscription = canonicalCycle
        && existing.customerSubscriptionId === canonicalCycle.subscriptionId;
      if (existing.recurringScheduleId !== schedule.id && !belongsToCanonicalSubscription) {
        throw new Error("Recurring invoice generation key belongs to another schedule.");
      }

      const shouldDeliver = canClaimDelivery({
        autoEmail: schedule.autoEmail,
        sentAt: existing.sentAt,
        status: existing.recurringDeliveryStatus,
        claimedAt: existing.recurringDeliveryClaimedAt,
        now: claimNow,
      });

      if (shouldDeliver) {
        await tx.invoice.update({
          where: { id: existing.id },
          data: {
            recurringDeliveryStatus: "sending",
            recurringDeliveryAttempts: { increment: 1 },
            recurringDeliveryClaimedAt: claimNow,
            recurringDeliveryError: null,
          },
        });
      }

      await tx.recurringInvoiceSchedule.update({
        where: { id: schedule.id },
        data: {
          nextIssueDate: advancedDate,
          lastGeneratedAt: asOf,
          lastInvoiceId: existing.id,
        },
      });
      if (canonicalCycle) {
        await tx.customerSubscription.update({
          where: { id: canonicalCycle.subscriptionId },
          data: { nextBillingDate: advancedDate },
        });
      }

      return {
        kind: "invoice",
        invoiceId: existing.id,
        created: false,
        shouldDeliver,
        ...recipient,
      };
    }

    const dueDate = addUtcDays(issueDate, schedule.dueDaysAfterIssue);
    const taxRate = schedule.taxRatePercent != null ? Number(schedule.taxRatePercent) : null;
    const shouldDeliver = schedule.autoEmail;

    const invoiceId = await createDraftInvoiceInTransaction(tx, {
      kind: "recurring",
      recurringScheduleId: schedule.id,
      recurringPeriodStart: periodStart,
      recurringGenerationKey: generationKey,
      recurringDeliveryStatus: shouldDeliver ? "sending" : "not_requested",
      recurringDeliveryAttempts: shouldDeliver ? 1 : 0,
      recurringDeliveryClaimedAt: shouldDeliver ? claimNow : null,
      customerId: schedule.customerId,
      customerSubscriptionId: canonicalCycle?.subscriptionId ?? null,
      billToName: schedule.billToName,
      billToLines: schedule.billToLines,
      currency: schedule.currency,
      taxLabel: schedule.taxLabel,
      taxRatePercent: taxRate,
      issueDate,
      dueDate,
      notes: schedule.notes,
      paymentInstructions: schedule.paymentInstructions,
      serviceAssignmentId: schedule.serviceAssignmentId,
      createdById: schedule.createdById,
      lineItems: canonicalCycle
        ? canonicalCycle.lines.map((line, index) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unitPrice: Number(line.billedAmount),
            unitLabel: "service",
            sortOrder: index,
          }))
        : schedule.lineItems.map((line, index) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            unitLabel: line.unitLabel,
            sortOrder: line.sortOrder ?? index,
          })),
    });

    if (canonicalCycle) {
      await persistCanonicalInvoiceSnapshots(tx, invoiceId, canonicalCycle);
    }
    await finalizeInvoiceInTransaction(tx, invoiceId);
    await tx.recurringInvoiceSchedule.update({
      where: { id: schedule.id },
      data: {
        nextIssueDate: advancedDate,
        lastGeneratedAt: asOf,
        lastInvoiceId: invoiceId,
      },
    });
    if (canonicalCycle) {
      await tx.customerSubscription.update({
        where: { id: canonicalCycle.subscriptionId },
        data: { nextBillingDate: advancedDate },
      });
    }

    return {
      kind: "invoice",
      invoiceId,
      created: true,
      shouldDeliver,
      ...recipient,
    };
  });
}

async function markRecurringDeliverySucceeded(invoiceId: string, deliveredAt: Date): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      sentAt: deliveredAt,
      recurringDeliveryStatus: "sent",
      recurringDeliveryClaimedAt: null,
      recurringDeliveryError: null,
    },
  });
}

async function markRecurringDeliveryFailed(invoiceId: string, error: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      recurringDeliveryStatus: "failed",
      recurringDeliveryError: error.slice(0, 2000),
    },
  });
}

export async function generateInvoiceFromSchedule(
  scheduleId: string,
  asOf: Date,
  options?: { force?: boolean; skipIfNoLongerDue?: boolean },
): Promise<RecurringInvoiceGenerationResult> {
  return coordinateRecurringInvoiceGeneration({
    commit: () => commitRecurringInvoicePeriod(scheduleId, asOf, options),
    deliver: ({ invoiceId, to, greetingName }) =>
      sendNativeInvoiceEmail({ invoiceId, to, greetingName }),
    deliverySucceeded: markRecurringDeliverySucceeded,
    deliveryFailed: markRecurringDeliveryFailed,
  });
}

async function claimRecurringInvoiceDelivery(
  invoiceId: string,
  asOf: Date,
): Promise<RecurringInvoiceCommitResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Invoice"
      WHERE "id" = ${invoiceId}
      FOR UPDATE
    `;
    if (!locked.length) throw new Error("Invoice not found.");

    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        recurringSchedule: {
          include: {
            customer: {
              select: { email: true, company: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!invoice || invoice.kind !== "recurring" || !invoice.recurringSchedule) {
      throw new Error("Recurring invoice schedule not found.");
    }

    const schedule = invoice.recurringSchedule;
    const shouldDeliver = canClaimDelivery({
      autoEmail: schedule.autoEmail,
      sentAt: invoice.sentAt,
      status: invoice.recurringDeliveryStatus,
      claimedAt: invoice.recurringDeliveryClaimedAt,
      now: asOf,
    });

    if (shouldDeliver) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          recurringDeliveryStatus: "sending",
          recurringDeliveryAttempts: { increment: 1 },
          recurringDeliveryClaimedAt: asOf,
          recurringDeliveryError: null,
        },
      });
    }

    return {
      kind: "invoice",
      invoiceId: invoice.id,
      created: false,
      shouldDeliver,
      ...resolveRecipientEmail(schedule),
    };
  });
}

export async function retryRecurringInvoiceDelivery(
  invoiceId: string,
  asOf = new Date(),
): Promise<RecurringInvoiceGenerationResult> {
  return coordinateRecurringInvoiceGeneration({
    commit: () => claimRecurringInvoiceDelivery(invoiceId, asOf),
    deliver: ({ invoiceId: id, to, greetingName }) =>
      sendNativeInvoiceEmail({ invoiceId: id, to, greetingName }),
    deliverySucceeded: markRecurringDeliverySucceeded,
    deliveryFailed: markRecurringDeliveryFailed,
    now: () => asOf,
  });
}

export async function markOverdueNativeInvoices(asOf: Date): Promise<number> {
  const todayStart = startOfUtcDay(asOf);
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ["open", "partially_paid"] },
      dueDate: { lt: todayStart },
    },
    data: { status: "overdue" },
  });
  return result.count;
}

export type ProcessRecurringSchedulesResult = {
  ok: true;
  schedulesChecked: number;
  invoicesGenerated: number;
  deliveriesRetried: number;
  overdueMarked: number;
  errors: { scheduleId: string; message: string }[];
  deliveryErrors: { invoiceId: string; message: string }[];
};

export async function processDueRecurringSchedules(asOf = new Date()): Promise<ProcessRecurringSchedulesResult> {
  const errors: { scheduleId: string; message: string }[] = [];
  const deliveryErrors: { invoiceId: string; message: string }[] = [];
  let invoicesGenerated = 0;
  let deliveriesRetried = 0;

  const retryBefore = new Date(asOf.getTime() - DELIVERY_CLAIM_TIMEOUT_MS);
  const retryRows = await prisma.invoice.findMany({
    where: {
      kind: "recurring",
      recurringScheduleId: { not: null },
      sentAt: null,
      OR: [
        {
          recurringDeliveryStatus: "failed",
          OR: [
            { recurringDeliveryClaimedAt: null },
            { recurringDeliveryClaimedAt: { lte: retryBefore } },
          ],
        },
        {
          recurringDeliveryStatus: "sending",
          OR: [
            { recurringDeliveryClaimedAt: null },
            { recurringDeliveryClaimedAt: { lte: retryBefore } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: DELIVERY_RETRY_LIMIT,
    select: { id: true },
  });

  for (const row of retryRows) {
    try {
      const result = await retryRecurringInvoiceDelivery(row.id, asOf);
      if (result.skipped) continue;
      if (result.emailed) deliveriesRetried += 1;
      if (result.emailError) {
        deliveryErrors.push({ invoiceId: row.id, message: result.emailError });
      }
    } catch (error) {
      deliveryErrors.push({
        invoiceId: row.id,
        message: error instanceof Error ? error.message : "Delivery retry failed.",
      });
    }
  }

  const due = await prisma.recurringInvoiceSchedule.findMany({
    where: { status: "active", nextIssueDate: { lte: asOf } },
    orderBy: { nextIssueDate: "asc" },
    select: { id: true },
  });

  for (const row of due) {
    let iterations = 0;
    while (iterations < MAX_CATCHUP_PER_RUN) {
      const current = await prisma.recurringInvoiceSchedule.findUnique({
        where: { id: row.id },
        select: { status: true, nextIssueDate: true },
      });
      if (!current || current.status !== "active" || current.nextIssueDate > asOf) break;

      try {
        const result = await generateInvoiceFromSchedule(row.id, asOf, {
          skipIfNoLongerDue: true,
        });
        if (result.skipped) break;
        if (result.created) invoicesGenerated += 1;
        if (result.emailError) {
          deliveryErrors.push({ invoiceId: result.invoiceId, message: result.emailError });
        }
        iterations += 1;
      } catch (e) {
        errors.push({
          scheduleId: row.id,
          message: e instanceof Error ? e.message : "Generation failed.",
        });
        break;
      }
    }
  }

  const overdueMarked = await markOverdueNativeInvoices(asOf);

  return {
    ok: true,
    schedulesChecked: due.length,
    invoicesGenerated,
    deliveriesRetried,
    overdueMarked,
    errors,
    deliveryErrors,
  };
}
