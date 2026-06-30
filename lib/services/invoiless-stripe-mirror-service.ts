import "server-only";

import { isNativeBillingPrimary } from "@/lib/domain/native-billing-cutover";

import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import {
  createInvoilessInvoiceApi,
  fetchInvoilessInvoiceForEdit,
  updateInvoilessInvoiceApi,
  type CreateInvoilessInvoiceItem,
} from "@/lib/invoiless/invoice-mutate";
import { invoilessInvoicePreviewUrl } from "@/lib/invoiless/preview-url";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";
import { getInvoilessExternalCustomerId } from "@/lib/services/billing-service";
import { getCurrentCustomerSubscription } from "@/lib/services/customer-subscription-service";
import { getStripeClient } from "@/lib/stripe/config";

import { recordOperationalEvent } from "./operational-event-service";

export function isInvoilessStripeMirrorEnabled(): boolean {
  if (isNativeBillingPrimary()) {
    return false;
  }
  if (!process.env.INVOILESS_API_KEY?.trim()) {
    return false;
  }
  const flag = process.env.INVOILESS_STRIPE_MIRROR?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") {
    return false;
  }
  return true;
}

function majorAmountFromStripeMinor(units: number, currency: string): number {
  const n = units ?? 0;
  const cur = currency.toLowerCase();
  const major = cur === "xcd" || cur === "usd" || cur === "eur" ? n / 100 : n / 100;
  return Math.round(major * 100) / 100;
}

function paidDateYmd(invoice: Stripe.Invoice): string {
  const paidAt =
    invoice.status_transitions?.paid_at != null
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date();
  return paidAt.toISOString().slice(0, 10);
}

async function buildInvoilessLineItems(
  invoice: Stripe.Invoice,
  customerId: string,
): Promise<CreateInvoilessInvoiceItem[]> {
  const currency = (invoice.currency ?? "xcd").toLowerCase();
  const stripe = getStripeClient();
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 50 });

  const items: CreateInvoilessInvoiceItem[] = [];
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
        ? majorAmountFromStripeMinor(lineTotal, currency) / quantity
        : majorAmountFromStripeMinor(invoice.amount_paid ?? invoice.total ?? 0, currency) / quantity;
    if (unitPrice <= 0) continue;
    items.push({
      name: desc.slice(0, 100),
      quantity,
      price: unitPrice,
    });
  }

  if (items.length > 0) {
    return items;
  }

  const sub = await getCurrentCustomerSubscription(customerId);
  const term = sub?.planTermMonths ?? 1;
  const vehicles = sub?.vehicleCount ?? 1;
  const rate = sub?.monthlyRateXcd != null ? Number(sub.monthlyRateXcd) : null;
  const total = majorAmountFromStripeMinor(invoice.amount_paid ?? invoice.total ?? 0, currency);
  const label =
    rate != null && rate > 0
      ? `Track Lucia — ${formatPlanTerm(term)} (${vehicles} vehicle${vehicles === 1 ? "" : "s"} @ ${formatXcd(rate)}/mo)`
      : `Track Lucia subscription — ${formatPlanTerm(term)}`;

  return [{ name: label.slice(0, 100), quantity: 1, price: Math.max(0.01, total) }];
}

function mirrorNotes(invoice: Stripe.Invoice): string {
  const parts = ["Paid via Stripe."];
  if (invoice.number) parts.push(`Stripe #${invoice.number}.`);
  parts.push(`Ref: ${invoice.id}.`);
  return parts.join(" ").slice(0, 1000);
}

async function ensureInvoilessInvoicePaid(
  invoilessInvoiceId: string,
  invoilessCustomerId: string,
): Promise<void> {
  const edit = await fetchInvoilessInvoiceForEdit(invoilessInvoiceId);
  if (edit.status.toLowerCase() === "paid") {
    return;
  }
  await updateInvoilessInvoiceApi({
    invoiceId: invoilessInvoiceId,
    invoilessCustomerId,
    items: edit.items,
    status: "Paid",
    notes: edit.notes,
    invoiceDate: edit.invoiceDateInput,
    dueDate: edit.dueDateInput || edit.invoiceDateInput,
  });
}

export type MirrorStripePaidToInvoilessResult =
  | { ok: true; action: "created" | "updated" | "skipped"; invoilessInvoiceId?: string; reason?: string }
  | { ok: false; error: string };

/**
 * Phase 5: on Stripe `invoice.paid`, create or mark Paid an Invoiless invoice for accounting (not billing engine).
 */
export async function mirrorStripePaidInvoiceToInvoiless(input: {
  stripeInvoice: Stripe.Invoice;
  customerId: string;
  tlBillingInvoiceId?: string | null;
}): Promise<MirrorStripePaidToInvoilessResult> {
  if (!isInvoilessStripeMirrorEnabled()) {
    return { ok: true, action: "skipped", reason: "Invoiless Stripe mirror disabled or not configured." };
  }

  const invoice = input.stripeInvoice;
  if (invoice.status !== "paid") {
    return { ok: true, action: "skipped", reason: "Stripe invoice is not paid." };
  }

  const amountPaid = invoice.amount_paid ?? 0;
  if (amountPaid <= 0) {
    return { ok: true, action: "skipped", reason: "Zero amount — nothing to mirror." };
  }

  const invoilessCustomerId = await getInvoilessExternalCustomerId(input.customerId);
  if (!invoilessCustomerId) {
    return { ok: true, action: "skipped", reason: "Customer is not linked to Invoiless." };
  }

  const stripeExternalId = invoice.id;
  let stripeRow =
    input.tlBillingInvoiceId != null
      ? await prisma.billingInvoice.findUnique({ where: { id: input.tlBillingInvoiceId } })
      : null;
  if (!stripeRow) {
    stripeRow = await prisma.billingInvoice.findUnique({
      where: {
        provider_externalInvoiceId: {
          provider: "stripe",
          externalInvoiceId: stripeExternalId,
        },
      },
    });
  }

  const existingInvoilessId = stripeRow?.invoilessMirrorInvoiceId?.trim();
  const issueYmd = paidDateYmd(invoice);
  const dueYmd =
    invoice.due_date != null
      ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
      : issueYmd;

  if (existingInvoilessId) {
    await ensureInvoilessInvoicePaid(existingInvoilessId, invoilessCustomerId);
    return { ok: true, action: "updated", invoilessInvoiceId: existingInvoilessId };
  }

  const items = await buildInvoilessLineItems(invoice, input.customerId);
  const { id: invoilessInvoiceId } = await createInvoilessInvoiceApi({
    invoilessCustomerId,
    items,
    status: "Paid",
    notes: mirrorNotes(invoice),
    invoiceDate: issueYmd,
    dueDate: dueYmd,
  });

  if (stripeRow) {
    await prisma.billingInvoice.update({
      where: { id: stripeRow.id },
      data: { invoilessMirrorInvoiceId: invoilessInvoiceId },
    });
  } else {
    const currency = (invoice.currency ?? "xcd").toLowerCase();
    await prisma.billingInvoice.upsert({
      where: {
        provider_externalInvoiceId: {
          provider: "stripe",
          externalInvoiceId: stripeExternalId,
        },
      },
      create: {
        customerId: input.customerId,
        provider: "stripe",
        externalInvoiceId: stripeExternalId,
        kind: "subscription",
        status: "paid",
        amountXcd: new Prisma.Decimal(majorAmountFromStripeMinor(amountPaid, currency)),
        currency,
        providerInvoiceNumber: invoice.number ?? null,
        invoilessMirrorInvoiceId: invoilessInvoiceId,
        paidAt: new Date(),
      },
      update: { invoilessMirrorInvoiceId: invoilessInvoiceId },
    });
  }

  return { ok: true, action: "created", invoilessInvoiceId };
}

export async function recordInvoilessMirrorEvent(
  customerId: string,
  stripeInvoiceId: string,
  result: MirrorStripePaidToInvoilessResult,
): Promise<void> {
  if (!result.ok) {
    await recordOperationalEvent({
      category: "billing.synced",
      summary: "Invoiless mirror failed for Stripe invoice",
      customerId,
      payload: { stripeInvoiceId, error: result.error },
    });
    return;
  }
  if (result.action === "skipped") {
    return;
  }
  await recordOperationalEvent({
    category: "billing.synced",
    summary:
      result.action === "created"
        ? "Invoiless invoice created (Stripe paid mirror)"
        : "Invoiless invoice marked paid (Stripe mirror)",
    customerId,
    payload: {
      stripeInvoiceId,
      invoilessInvoiceId: result.invoilessInvoiceId,
      previewUrl: result.invoilessInvoiceId
        ? invoilessInvoicePreviewUrl(result.invoilessInvoiceId)
        : undefined,
    },
  });
}
