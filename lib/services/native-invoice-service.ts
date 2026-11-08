import "server-only";

import { randomBytes } from "node:crypto";

import type { InvoiceKind, InvoiceStatus, PaymentMethod, Prisma } from "@prisma/client";

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
  customerSubscriptionId?: string | null;
  billToName?: string | null;
  billToLines?: string[];
  currency?: string;
  kind?: InvoiceKind;
  recurringScheduleId?: string | null;
  recurringPeriodStart?: Date | null;
  recurringGenerationKey?: string | null;
  recurringDeliveryStatus?: Prisma.InvoiceCreateInput["recurringDeliveryStatus"];
  recurringDeliveryAttempts?: number;
  recurringDeliveryClaimedAt?: Date | null;
  recurringDeliveryError?: string | null;
  adjustmentGenerationKey?: string | null;
  canonicalInitialGenerationKey?: string | null;
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
type InvoiceCreateClient = Pick<Prisma.TransactionClient, "invoice">;

async function createDraftInvoiceWithClient(
  db: InvoiceCreateClient,
  input: CreateDraftInvoiceInput,
): Promise<string> {
  if (!input.lineItems.length) {
    throw new Error("An invoice needs at least one line item.");
  }
  const currency = (input.currency ?? "XCD").toUpperCase();
  const totals = computeDocumentTotals(
    input.lineItems,
    input.taxRatePercent ?? null,
    input.discountAmount ?? null,
  );

  const created = await db.invoice.create({
    data: {
      status: "draft",
      kind: input.kind ?? "one_off",
      customerId: input.customerId ?? null,
      customerSubscriptionId: input.customerSubscriptionId ?? null,
      recurringScheduleId: input.recurringScheduleId ?? null,
      recurringPeriodStart: input.recurringPeriodStart ?? null,
      recurringGenerationKey: input.recurringGenerationKey ?? null,
      recurringDeliveryStatus: input.recurringDeliveryStatus ?? null,
      recurringDeliveryAttempts: input.recurringDeliveryAttempts ?? 0,
      recurringDeliveryClaimedAt: input.recurringDeliveryClaimedAt ?? null,
      recurringDeliveryError: input.recurringDeliveryError ?? null,
      adjustmentGenerationKey: input.adjustmentGenerationKey ?? null,
      canonicalInitialGenerationKey: input.canonicalInitialGenerationKey ?? null,
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

export async function createDraftInvoice(input: CreateDraftInvoiceInput): Promise<string> {
  return createDraftInvoiceWithClient(prisma, input);
}

/** Create a draft as part of a larger atomic billing transaction. */
export async function createDraftInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateDraftInvoiceInput,
): Promise<string> {
  return createDraftInvoiceWithClient(tx, input);
}

/** Replace line items and totals on a draft invoice. */
export async function updateDraftInvoice(invoiceId: string, input: CreateDraftInvoiceInput): Promise<void> {
  if (!input.lineItems.length) {
    throw new Error("An invoice needs at least one line item.");
  }

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, customerSubscriptionId: true },
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
        customerSubscriptionId: input.customerSubscriptionId === undefined
          ? existing.customerSubscriptionId
          : input.customerSubscriptionId,
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
  return prisma.$transaction((tx) => finalizeInvoiceInTransaction(tx, invoiceId));
}

/** Finalize an invoice inside an existing transaction. */
export async function finalizeInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<{ number: string; publicToken: string; status: InvoiceStatus }> {
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

/** Statuses on which extra charges can still be appended to an issued invoice. */
const ADD_CHARGES_ALLOWED_STATUSES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  "open",
  "partially_paid",
  "overdue",
]);

export function canAppendChargesToInvoice(inv: {
  status: InvoiceStatus;
  kind: InvoiceKind;
  archivedAt: Date | null;
}): boolean {
  return (
    ADD_CHARGES_ALLOWED_STATUSES.has(inv.status) &&
    inv.kind !== "subscription_mirror" &&
    !inv.archivedAt
  );
}

export type AppendInvoiceChargesInput = {
  invoiceId: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number }>;
  /** When defined, updates the "pay by card online" flag on the invoice. */
  allowOnlinePayment?: boolean;
};

/**
 * Append line items to an already-issued invoice. Existing lines are never changed; the
 * document total and balance due are recomputed (payments already recorded are preserved).
 * The invoice number, pay link, and status are unchanged.
 */
export async function appendChargesToIssuedInvoice(
  input: AppendInvoiceChargesInput,
): Promise<{ total: number; amountDue: number; addedTotal: number }> {
  if (!input.lines.length) throw new Error("Add at least one line.");
  for (const line of input.lines) {
    if (!line.description.trim()) throw new Error("Each line needs a description.");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("Invalid quantity.");
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) throw new Error("Invalid unit price.");
  }

  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        status: true,
        kind: true,
        archivedAt: true,
        taxRatePercent: true,
        discountTotal: true,
        amountPaid: true,
        lineItems: { select: { quantity: true, unitPrice: true, sortOrder: true } },
      },
    });
    if (!inv) throw new Error("Invoice not found.");
    if (!canAppendChargesToInvoice(inv)) {
      throw new Error("Charges can only be added to open, partially paid, or overdue invoices.");
    }

    const maxSort = inv.lineItems.reduce((m, l) => Math.max(m, l.sortOrder), -1);
    const newLines: NativeLineInput[] = input.lines.map((l, i) => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      sortOrder: maxSort + 1 + i,
    }));

    const allLines = [
      ...inv.lineItems.map((l) => ({ description: "", quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      ...newLines,
    ];
    const totals = computeDocumentTotals(
      allLines,
      inv.taxRatePercent != null ? Number(inv.taxRatePercent) : null,
      Number(inv.discountTotal),
    );
    const amountPaid = round2(Number(inv.amountPaid));
    const amountDue = round2(totals.total - amountPaid);
    const addedTotal = round2(newLines.reduce((s, l) => s + computeLineTotal(l.quantity, l.unitPrice), 0));

    await tx.invoiceLineItem.createMany({
      data: lineCreateData(newLines).map((l) => ({ ...l, invoiceId: inv.id })),
    });
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        subtotal: toMoneyString(totals.subtotal),
        discountTotal: toMoneyString(totals.discountTotal),
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        amountDue: toMoneyString(amountDue),
        ...(input.allowOnlinePayment !== undefined ? { allowOnlinePayment: input.allowOnlinePayment } : {}),
      },
    });
    return { total: totals.total, amountDue, addedTotal };
  });
}

/** Mark an invoice void (not collectable; preserved for audit). */
export async function voidInvoice(invoiceId: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "void", voidedAt: new Date() },
  });
}

/** Permanently remove an invoice that has never been finalized or paid. */
export async function deleteDraftInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be deleted. Paid or recorded invoices must be voided.");
  await prisma.invoice.delete({ where: { id: invoiceId } });
}

/** Write off an invoice (bad debt; preserved for audit). */
export async function writeOffInvoice(invoiceId: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "written_off" },
  });
}
