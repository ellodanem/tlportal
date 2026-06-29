import "server-only";

import { randomBytes } from "node:crypto";

import { allocateQuoteNumber } from "@/lib/billing/native/numbering";
import { prisma } from "@/lib/db";
import {
  computeDocumentTotals,
  computeLineTotal,
  toMoneyString,
  toQtyString,
} from "@/lib/domain/native-billing";

import type { NativeLineInput } from "./native-invoice-service";

export type CreateQuoteInput = {
  customerId?: string | null;
  billToName?: string | null;
  billToLines?: string[];
  currency?: string;
  taxLabel?: string | null;
  taxRatePercent?: number | null;
  issueDate?: Date;
  validUntil?: Date | null;
  notes?: string | null;
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

/** Create a draft quote (no number allocated until sent). Returns the new quote id. */
export async function createQuote(input: CreateQuoteInput): Promise<string> {
  if (!input.lineItems.length) {
    throw new Error("A quote needs at least one line item.");
  }
  const currency = (input.currency ?? "XCD").toUpperCase();
  const totals = computeDocumentTotals(input.lineItems, input.taxRatePercent ?? null);

  const created = await prisma.quote.create({
    data: {
      status: "draft",
      customerId: input.customerId ?? null,
      billToName: input.billToName ?? null,
      billToLines: input.billToLines ?? [],
      currency,
      subtotal: toMoneyString(totals.subtotal),
      taxLabel: input.taxLabel ?? null,
      taxRatePercent: input.taxRatePercent != null ? input.taxRatePercent.toFixed(2) : null,
      taxTotal: toMoneyString(totals.taxTotal),
      total: toMoneyString(totals.total),
      issueDate: input.issueDate ?? new Date(),
      validUntil: input.validUntil ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
      lineItems: { create: lineCreateData(input.lineItems) },
    },
    select: { id: true },
  });
  return created.id;
}

/** Replace line items and totals on a draft quote. */
export async function updateDraftQuote(quoteId: string, input: CreateQuoteInput): Promise<void> {
  if (!input.lineItems.length) {
    throw new Error("A quote needs at least one line item.");
  }

  const existing = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { status: true },
  });
  if (!existing) throw new Error("Quote not found");
  if (existing.status !== "draft") {
    throw new Error("Only draft quotes can be edited.");
  }

  const currency = (input.currency ?? "XCD").toUpperCase();
  const totals = computeDocumentTotals(input.lineItems, input.taxRatePercent ?? null);

  await prisma.$transaction(async (tx) => {
    await tx.quoteLineItem.deleteMany({ where: { quoteId } });
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        customerId: input.customerId ?? null,
        billToName: input.billToName ?? null,
        billToLines: input.billToLines ?? [],
        currency,
        subtotal: toMoneyString(totals.subtotal),
        taxLabel: input.taxLabel ?? null,
        taxRatePercent: input.taxRatePercent != null ? input.taxRatePercent.toFixed(2) : null,
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        issueDate: input.issueDate ?? new Date(),
        validUntil: input.validUntil ?? null,
        notes: input.notes ?? null,
        lineItems: { create: lineCreateData(input.lineItems) },
      },
    });
  });
}

/** Mark a quote sent: allocate `TL-Q-{n}`, mint a public token, set sentAt. Idempotent. */
export async function markQuoteSent(quoteId: string): Promise<{ number: string; publicToken: string }> {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, number: true, publicToken: true, status: true },
    });
    if (!quote) throw new Error("Quote not found");

    const number = quote.number ?? (await allocateQuoteNumber(tx));
    const publicToken = quote.publicToken ?? randomToken();

    await tx.quote.update({
      where: { id: quoteId },
      data: {
        number,
        publicToken,
        status: quote.status === "draft" ? "sent" : quote.status,
        sentAt: new Date(),
      },
    });
    return { number, publicToken };
  });
}

export async function acceptQuote(quoteId: string): Promise<void> {
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: "accepted", acceptedAt: new Date() },
  });
}

export async function declineQuote(quoteId: string): Promise<void> {
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: "declined", declinedAt: new Date() },
  });
}

export type ConvertQuoteOptions = {
  dueDate?: Date | null;
  paymentInstructions?: string | null;
  createdById?: string | null;
};

/**
 * Convert a quote into a draft native invoice (copies bill-to, lines, tax).
 * Links both sides and marks the quote `converted`. Idempotent: returns the
 * existing linked invoice id if already converted.
 */
export async function convertQuoteToInvoice(
  quoteId: string,
  options: ConvertQuoteOptions = {},
): Promise<{ invoiceId: string }> {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!quote) throw new Error("Quote not found");
    if (quote.convertedInvoiceId) {
      return { invoiceId: quote.convertedInvoiceId };
    }

    const lines: NativeLineInput[] = quote.lineItems.map((line, index) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      unitLabel: line.unitLabel,
      sortOrder: line.sortOrder ?? index,
    }));
    const taxRatePercent = quote.taxRatePercent != null ? Number(quote.taxRatePercent) : null;
    const totals = computeDocumentTotals(lines, taxRatePercent);

    const invoice = await tx.invoice.create({
      data: {
        status: "draft",
        kind: "one_off",
        customerId: quote.customerId,
        billToName: quote.billToName,
        billToLines: quote.billToLines,
        currency: quote.currency,
        subtotal: toMoneyString(totals.subtotal),
        taxLabel: quote.taxLabel,
        taxRatePercent: taxRatePercent != null ? taxRatePercent.toFixed(2) : null,
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        amountPaid: "0.00",
        amountDue: toMoneyString(totals.total),
        dueDate: options.dueDate ?? null,
        paymentInstructions: options.paymentInstructions ?? null,
        createdById: options.createdById ?? quote.createdById,
        lineItems: { create: lineCreateData(lines) },
      },
      select: { id: true },
    });

    await tx.quote.update({
      where: { id: quoteId },
      data: { status: "converted", convertedInvoiceId: invoice.id },
    });

    return { invoiceId: invoice.id };
  });
}
