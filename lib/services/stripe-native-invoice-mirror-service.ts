import "server-only";

import type { InvoiceStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { prisma } from "@/lib/db";
import {
  computeLineTotal,
  round2,
  toMoneyString,
  toQtyString,
} from "@/lib/domain/native-billing";
import { getStripeClient } from "@/lib/stripe/config";

function majorFromStripeMinor(units: number, currency: string): number {
  const n = units ?? 0;
  const major = currency.toLowerCase() === "xcd" || currency.toLowerCase() === "usd" ? n / 100 : n / 100;
  return round2(major);
}

export function mapStripeBillingStatusToNative(
  stripeStatus: string,
  total: number,
  amountPaid: number,
): InvoiceStatus {
  const s = stripeStatus.toLowerCase();
  if (s === "void") return "void";
  if (s === "uncollectible") return "written_off";
  if (s === "paid" || round2(amountPaid) >= round2(total)) return "paid";
  if (amountPaid > 0 && amountPaid < total) return "partially_paid";
  if (s === "draft") return "draft";
  return "open";
}

async function buildMirrorLineItems(
  stripeInvoice: Stripe.Invoice,
  customerId: string,
  fallbackTotal: number,
): Promise<{ description: string; quantity: number; unitPrice: number }[]> {
  const currency = (stripeInvoice.currency ?? "xcd").toLowerCase();
  const stripe = getStripeClient();
  const lines = await stripe.invoices.listLineItems(stripeInvoice.id, { limit: 50 });

  const items: { description: string; quantity: number; unitPrice: number }[] = [];
  for (const line of lines.data) {
    const desc =
      line.description?.trim() ||
      (typeof line.price?.product === "object" && line.price?.product && "name" in line.price.product
        ? String((line.price.product as { name?: string }).name ?? "")
        : "") ||
      "Subscription";
    const quantity = Math.max(1, line.quantity ?? 1);
    const lineTotal = line.amount ?? 0;
    const unitPrice =
      lineTotal > 0
        ? majorFromStripeMinor(lineTotal, currency) / quantity
        : fallbackTotal / quantity;
    if (unitPrice <= 0) continue;
    items.push({ description: desc.slice(0, 500), quantity, unitPrice: round2(unitPrice) });
  }

  if (items.length > 0) return items;

  const sub = await prisma.customerSubscription.findFirst({
    where: { customerId, status: { in: ["active", "trialing", "past_due"] } },
    orderBy: { updatedAt: "desc" },
    select: { planTermMonths: true, vehicleCount: true, monthlyRateXcd: true },
  });
  const term = sub?.planTermMonths ?? 1;
  const vehicles = sub?.vehicleCount ?? 1;
  const rate = sub?.monthlyRateXcd != null ? Number(sub.monthlyRateXcd) : null;
  const label =
    rate != null && rate > 0
      ? `Fleet monitoring — ${vehicles} vehicle${vehicles === 1 ? "" : "s"} × ${term} mo @ EC$${rate.toFixed(2)}/mo`
      : `Track Lucia subscription (${term} mo)`;

  return [{ description: label, quantity: 1, unitPrice: fallbackTotal }];
}

async function ensureStripePaymentMirror(
  nativeInvoiceId: string,
  billing: {
    customerId: string;
    externalInvoiceId: string;
    amountXcd: Prisma.Decimal;
    currency: string;
    paidAt: Date | null;
  },
): Promise<void> {
  if (!billing.paidAt) return;

  const existing = await prisma.payment.findFirst({
    where: {
      invoiceId: nativeInvoiceId,
      method: "stripe",
      reference: billing.externalInvoiceId,
      voidedAt: null,
    },
    select: { id: true },
  });
  if (existing) return;

  await prisma.payment.create({
    data: {
      invoiceId: nativeInvoiceId,
      customerId: billing.customerId,
      amount: toMoneyString(Number(billing.amountXcd)),
      currency: billing.currency.toUpperCase(),
      method: "stripe",
      reference: billing.externalInvoiceId,
      receivedAt: billing.paidAt,
    },
  });
}

/**
 * Upsert a native `Invoice` (kind = subscription_mirror) from a Stripe `BillingInvoice` row.
 * Reuses the BillingInvoice `displayNumber` as `Invoice.number` — no second sequence allocation.
 */
export async function syncBillingInvoiceToNativeMirror(billingInvoiceId: string): Promise<string | null> {
  const billing = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    include: {
      customer: {
        select: {
          id: true,
          company: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
      nativeMirror: { select: { id: true } },
    },
  });
  if (!billing || billing.provider !== "stripe") return null;

  const stripeStatus = billing.status.toLowerCase();
  // Do not create native AR rows for open / failed Stripe invoices (declined cards).
  // Still update if a mirror already exists (e.g. void after a prior paid sync mistake).
  if (stripeStatus !== "paid" && !billing.nativeMirror) {
    return null;
  }

  const billToLines = customerBillToLines(billing.customer);
  const billToName = billToLines[0] ?? null;
  const total = round2(Number(billing.amountXcd));
  const amountPaid = stripeStatus === "paid" ? total : 0;
  const amountDue = round2(total - amountPaid);
  const status = mapStripeBillingStatusToNative(stripeStatus, total, amountPaid);
  const currency = billing.currency.toUpperCase();
  const issueDate = billing.periodStart ?? billing.createdAt;
  const dueDate = billing.periodEnd ?? billing.paidAt ?? billing.createdAt;

  let lineItems: { description: string; quantity: number; unitPrice: number }[];
  try {
    const stripe = getStripeClient();
    const stripeInvoice = await stripe.invoices.retrieve(billing.externalInvoiceId);
    lineItems = await buildMirrorLineItems(stripeInvoice, billing.customerId, total);
  } catch {
    lineItems = [{ description: "Track Lucia subscription", quantity: 1, unitPrice: total }];
  }

  const subtotal = round2(lineItems.reduce((s, l) => s + computeLineTotal(l.quantity, l.unitPrice), 0));
  const lineCreate = lineItems.map((line, index) => ({
    sortOrder: index,
    description: line.description,
    quantity: toQtyString(line.quantity),
    unitPrice: toMoneyString(line.unitPrice),
    lineTotal: toMoneyString(computeLineTotal(line.quantity, line.unitPrice)),
  }));

  const notes =
    billing.kind === "subscription" && billing.periodStart && billing.periodEnd
      ? `Stripe subscription invoice (${billing.periodStart.toISOString().slice(0, 10)} – ${billing.periodEnd.toISOString().slice(0, 10)}).`
      : "Stripe invoice.";

  const nativeId = await prisma.$transaction(async (tx) => {
    const existingId = billing.nativeMirror?.id;
    const data = {
      status,
      kind: "subscription_mirror" as const,
      customerId: billing.customerId,
      billToName,
      billToLines,
      currency,
      subtotal: toMoneyString(subtotal),
      taxTotal: "0.00",
      total: toMoneyString(total),
      amountPaid: toMoneyString(amountPaid),
      amountDue: toMoneyString(amountDue),
      issueDate,
      dueDate,
      notes,
      paymentInstructions: null,
      number: billing.displayNumber,
      sentAt: status !== "draft" ? billing.createdAt : null,
      paidAt: billing.paidAt,
      billingInvoiceId: billing.id,
    };

    if (existingId) {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: existingId } });
      await tx.invoice.update({
        where: { id: existingId },
        data: { ...data, lineItems: { create: lineCreate } },
      });
      return existingId;
    }

    const created = await tx.invoice.create({
      data: { ...data, lineItems: { create: lineCreate } },
      select: { id: true },
    });
    return created.id;
  });

  if (status === "paid") {
    await ensureStripePaymentMirror(nativeId, billing);
  }

  return nativeId;
}

export async function backfillStripeNativeInvoiceMirrors(): Promise<{
  processed: number;
  mirrored: number;
  errors: { billingInvoiceId: string; message: string }[];
}> {
  const rows = await prisma.billingInvoice.findMany({
    where: { provider: "stripe", nativeMirror: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const errors: { billingInvoiceId: string; message: string }[] = [];
  let mirrored = 0;

  for (const row of rows) {
    try {
      const id = await syncBillingInvoiceToNativeMirror(row.id);
      if (id) mirrored += 1;
    } catch (e) {
      errors.push({
        billingInvoiceId: row.id,
        message: e instanceof Error ? e.message : "Mirror failed.",
      });
    }
  }

  return { processed: rows.length, mirrored, errors };
}
