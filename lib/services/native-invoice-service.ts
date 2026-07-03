import "server-only";

import { randomBytes } from "node:crypto";

import type { InvoiceKind, InvoiceStatus, PaymentMethod } from "@prisma/client";

import { allocateInvoiceNumber } from "@/lib/billing/native/numbering";
import { prisma } from "@/lib/db";
import {
  computeDocumentTotals,
  computeLineTotal,
  derivePaidState,
  round2,
  toMoneyString,
  toQtyString,
} from "@/lib/domain/native-billing";

export type NativeLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string | null;
  sortOrder?: number;
};

export type CreateDraftInvoiceInput = {
  customerId?: string | null;
  billToName?: string | null;
  billToLines?: string[];
  currency?: string;
  kind?: InvoiceKind;
  recurringScheduleId?: string | null;
  taxLabel?: string | null;
  taxRatePercent?: number | null;
  discountAmount?: number | null;
  issueDate?: Date;
  dueDate?: Date | null;
  notes?: string | null;
  paymentInstructions?: string | null;
  allowOnlinePayment?: boolean;
  serviceAssignmentId?: string | null;
  createdById?: string | null;
  lineItems: NativeLineInput[];
};

function randomToken(): string {
  return randomBytes(18).toString("base64url");
}

function lineCreateData(lines: NativeLineInput[]) {
  return lines.map((line, index) => ({
    sortOrder: line.sortOrder ?? index,
    description: line.description,
    quantity: toQtyString(line.quantity),
    unitLabel: line.unitLabel ?? null,
    unitPrice: toMoneyString(line.unitPrice),
    lineTotal: toMoneyString(computeLineTotal(line.quantity, line.unitPrice)),
  }));
}

/**
 * Create a draft native invoice (no number allocated yet). Returns the new invoice id.
 */
export async function createDraftInvoice(input: CreateDraftInvoiceInput): Promise<string> {
  if (!input.lineItems.length) {
    throw new Error("An invoice needs at least one line item.");
  }
  const currency = (input.currency ?? "XCD").toUpperCase();
  const totals = computeDocumentTotals(
    input.lineItems,
    input.taxRatePercent ?? null,
    input.discountAmount ?? null,
  );

  const created = await prisma.invoice.create({
    data: {
      status: "draft",
      kind: input.kind ?? "one_off",
      customerId: input.customerId ?? null,
      recurringScheduleId: input.recurringScheduleId ?? null,
      billToName: input.billToName ?? null,
      billToLines: input.billToLines ?? [],
      currency,
      subtotal: toMoneyString(totals.subtotal),
      discountTotal: toMoneyString(totals.discountTotal),
      taxLabel: input.taxLabel ?? null,
      taxRatePercent: input.taxRatePercent != null ? input.taxRatePercent.toFixed(2) : null,
      taxTotal: toMoneyString(totals.taxTotal),
      total: toMoneyString(totals.total),
      amountPaid: "0.00",
      amountDue: toMoneyString(totals.total),
      issueDate: input.issueDate ?? new Date(),
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      paymentInstructions: input.paymentInstructions ?? null,
      allowOnlinePayment: input.allowOnlinePayment ?? false,
      serviceAssignmentId: input.serviceAssignmentId ?? null,
      createdById: input.createdById ?? null,
      lineItems: { create: lineCreateData(input.lineItems) },
    },
    select: { id: true },
  });
  return created.id;
}

/** Replace line items and totals on a draft invoice. */
export async function updateDraftInvoice(invoiceId: string, input: CreateDraftInvoiceInput): Promise<void> {
  if (!input.lineItems.length) {
    throw new Error("An invoice needs at least one line item.");
  }

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  if (!existing) throw new Error("Invoice not found");
  if (existing.status !== "draft") {
    throw new Error("Only draft invoices can be edited.");
  }

  const currency = (input.currency ?? "XCD").toUpperCase();
  const totals = computeDocumentTotals(
    input.lineItems,
    input.taxRatePercent ?? null,
    input.discountAmount ?? null,
  );

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: input.customerId ?? null,
        billToName: input.billToName ?? null,
        billToLines: input.billToLines ?? [],
        currency,
        subtotal: toMoneyString(totals.subtotal),
        discountTotal: toMoneyString(totals.discountTotal),
        taxLabel: input.taxLabel ?? null,
        taxRatePercent: input.taxRatePercent != null ? input.taxRatePercent.toFixed(2) : null,
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        amountPaid: "0.00",
        amountDue: toMoneyString(totals.total),
        issueDate: input.issueDate ?? new Date(),
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        paymentInstructions: input.paymentInstructions ?? null,
        allowOnlinePayment: input.allowOnlinePayment ?? false,
        serviceAssignmentId: input.serviceAssignmentId ?? null,
        lineItems: { create: lineCreateData(input.lineItems) },
      },
    });
  });
}

/** Finalize and mark sent (allocate TL-INV number, public token, sentAt). */
export async function finalizeAndSendInvoice(
  invoiceId: string,
): Promise<{ number: string; publicToken: string }> {
  const { number, publicToken } = await finalizeInvoice(invoiceId);
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { sentAt: new Date() },
  });
  return { number, publicToken };
}

/**
 * Finalize a draft invoice: allocate `TL-INV-{n}`, mint a public token, move draft → open.
 * Idempotent — keeps an existing number/token if already set.
 */
export async function finalizeInvoice(
  invoiceId: string,
): Promise<{ number: string; publicToken: string; status: InvoiceStatus }> {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, number: true, publicToken: true, status: true },
    });
    if (!inv) throw new Error("Invoice not found");

    const number = inv.number ?? (await allocateInvoiceNumber(tx));
    const publicToken = inv.publicToken ?? randomToken();
    const status: InvoiceStatus = inv.status === "draft" ? "open" : inv.status;

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { number, publicToken, status },
    });
    return { number, publicToken, status };
  });
}

export type RecordPaymentInput = {
  invoiceId: string;
  amount: number;
  method?: PaymentMethod;
  reference?: string | null;
  stripePaymentIntentId?: string | null;
  receivedAt?: Date;
  notes?: string | null;
  recordedById?: string | null;
};

/**
 * Record a payment against a finalized invoice and recompute paid totals + status
 * from all non-voided payments (supports partial payments). Runs in one transaction.
 */
export async function recordInvoicePayment(input: RecordPaymentInput): Promise<{
  paymentId: string;
  status: InvoiceStatus;
  amountPaid: number;
  amountDue: number;
}> {
  if (!(input.amount > 0)) {
    throw new Error("Payment amount must be greater than zero.");
  }
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, customerId: true, currency: true, total: true, status: true },
    });
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "draft") {
      throw new Error("Finalize the invoice before recording a payment.");
    }

    const receivedAt = input.receivedAt ?? new Date();
    const payment = await tx.payment.create({
      data: {
        invoiceId: inv.id,
        customerId: inv.customerId,
        amount: toMoneyString(input.amount),
        currency: inv.currency,
        method: input.method ?? "cash",
        reference: input.reference ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        receivedAt,
        notes: input.notes ?? null,
        recordedById: input.recordedById ?? null,
      },
      select: { id: true },
    });

    const agg = await tx.payment.aggregate({
      where: { invoiceId: inv.id, voidedAt: null },
      _sum: { amount: true },
    });
    const amountPaid = round2(Number(agg._sum.amount ?? 0));
    const total = round2(Number(inv.total));
    const amountDue = round2(total - amountPaid);

    const status: InvoiceStatus =
      inv.status === "void" || inv.status === "written_off"
        ? inv.status
        : derivePaidState(total, amountPaid);

    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        amountPaid: toMoneyString(amountPaid),
        amountDue: toMoneyString(amountDue),
        status,
        paidAt: status === "paid" ? receivedAt : null,
      },
    });

    return { paymentId: payment.id, status, amountPaid, amountDue };
  });
}

/** Mark an invoice void (not collectable; preserved for audit). */
export async function voidInvoice(invoiceId: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "void", voidedAt: new Date() },
  });
}

/** Write off an invoice (bad debt; preserved for audit). */
export async function writeOffInvoice(invoiceId: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "written_off" },
  });
}
