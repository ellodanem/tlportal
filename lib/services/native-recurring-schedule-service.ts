import "server-only";

import type { RecurringScheduleStatus } from "@prisma/client";

import { sendNativeInvoiceEmail } from "@/lib/billing/send-native-invoice-email";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";
import {
  computeLineTotal,
  toMoneyString,
  toQtyString,
} from "@/lib/domain/native-billing";
import type { NativeLineInput } from "@/lib/services/native-invoice-service";
import { createDraftInvoice, finalizeAndSendInvoice } from "@/lib/services/native-invoice-service";

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

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addUtcMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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

async function resolveRecipientEmail(schedule: {
  emailTo: string | null;
  billToName: string | null;
  billToLines: string[];
  customerId: string | null;
  customer: { email: string | null; company: string | null; firstName: string | null; lastName: string | null } | null;
}): Promise<{ to: string | null; greetingName: string }> {
  const to = schedule.emailTo?.trim() || schedule.customer?.email?.trim() || null;
  const greetingName = schedule.customer
    ? customerDisplayName(schedule.customer)
    : schedule.billToName?.trim() || (schedule.billToLines[0] ?? "there");
  return { to, greetingName };
}

export async function generateInvoiceFromSchedule(
  scheduleId: string,
  asOf: Date,
  options?: { force?: boolean },
): Promise<{ invoiceId: string; emailed: boolean; emailError?: string }> {
  const schedule = await prisma.recurringInvoiceSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      customer: {
        select: { email: true, company: true, firstName: true, lastName: true },
      },
    },
  });
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status !== "active") throw new Error("Schedule is not active.");
  if (!options?.force && schedule.nextIssueDate > asOf) throw new Error("Schedule is not due yet.");

  const issueDate = options?.force ? startOfUtcDay(asOf) : schedule.nextIssueDate;
  const dueDate = addUtcDays(issueDate, schedule.dueDaysAfterIssue);
  const taxRate = schedule.taxRatePercent != null ? Number(schedule.taxRatePercent) : null;

  const invoiceId = await createDraftInvoice({
    kind: "recurring",
    recurringScheduleId: schedule.id,
    customerId: schedule.customerId,
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
    lineItems: schedule.lineItems.map((line, index) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      unitLabel: line.unitLabel,
      sortOrder: line.sortOrder ?? index,
    })),
  });

  await finalizeAndSendInvoice(invoiceId);

  let emailed = false;
  let emailError: string | undefined;
  if (schedule.autoEmail) {
    const { to, greetingName } = await resolveRecipientEmail(schedule);
    if (to) {
      const sent = await sendNativeInvoiceEmail({ invoiceId, to, greetingName });
      if ("error" in sent) {
        emailError = sent.error;
      } else {
        emailed = true;
      }
    } else {
      emailError = "No recipient email on schedule or customer.";
    }
  }

  await prisma.recurringInvoiceSchedule.update({
    where: { id: scheduleId },
    data: {
      nextIssueDate: addUtcMonths(issueDate, schedule.intervalMonths),
      lastGeneratedAt: asOf,
      lastInvoiceId: invoiceId,
    },
  });

  return { invoiceId, emailed, emailError };
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
  overdueMarked: number;
  errors: { scheduleId: string; message: string }[];
};

export async function processDueRecurringSchedules(asOf = new Date()): Promise<ProcessRecurringSchedulesResult> {
  const errors: { scheduleId: string; message: string }[] = [];
  let invoicesGenerated = 0;

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
        await generateInvoiceFromSchedule(row.id, asOf);
        invoicesGenerated += 1;
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
    overdueMarked,
    errors,
  };
}
