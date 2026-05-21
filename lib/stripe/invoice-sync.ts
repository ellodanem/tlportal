import "server-only";

import type { BillingInvoiceKind } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";

import { getStripeClient } from "./config";

function amountFromStripeMinor(units: number | null | undefined, currency: string): Prisma.Decimal {
  const n = units ?? 0;
  const major = currency.toLowerCase() === "xcd" || currency.toLowerCase() === "usd" ? n / 100 : n / 100;
  return new Prisma.Decimal(Math.round(major * 100) / 100);
}

export async function resolveTlCustomerIdFromStripeInvoice(
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const fromMeta = invoice.metadata?.tl_customer_id?.trim();
  if (fromMeta) return fromMeta;

  const subRef = invoice.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (subId) {
    const stripe = getStripeClient();
    const sub = await stripe.subscriptions.retrieve(subId);
    const fromSub = sub.metadata?.tl_customer_id?.trim();
    if (fromSub) return fromSub;
  }

  const custRef = invoice.customer;
  const stripeCustomerId = typeof custRef === "string" ? custRef : custRef?.id;
  if (stripeCustomerId) {
    const account = await prisma.billingAccount.findUnique({
      where: {
        provider_externalCustomerId: {
          provider: "stripe",
          externalCustomerId: stripeCustomerId,
        },
      },
      select: { customerId: true },
    });
    if (account) return account.customerId;
  }

  return null;
}

export async function syncStripeInvoiceToDatabase(
  invoice: Stripe.Invoice,
): Promise<{ customerId: string | null; invoiceId: string | null }> {
  const customerId = await resolveTlCustomerIdFromStripeInvoice(invoice);
  if (!customerId) {
    return { customerId: null, invoiceId: null };
  }

  const currency = (invoice.currency ?? "xcd").toLowerCase();
  const amountPaid = invoice.amount_paid ?? invoice.total ?? 0;
  const subRef = invoice.subscription;
  const stripeSubscriptionId =
    typeof subRef === "string" ? subRef : subRef?.id ?? null;

  const kind: BillingInvoiceKind =
    stripeSubscriptionId != null ? "subscription" : "one_time";

  const periodStart =
    invoice.period_start != null ? new Date(invoice.period_start * 1000) : null;
  const periodEnd = invoice.period_end != null ? new Date(invoice.period_end * 1000) : null;
  const paidAt =
    invoice.status_transitions?.paid_at != null
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : invoice.status === "paid"
        ? new Date()
        : null;

  const row = await prisma.billingInvoice.upsert({
    where: {
      provider_externalInvoiceId: {
        provider: "stripe",
        externalInvoiceId: invoice.id,
      },
    },
    create: {
      customerId,
      provider: "stripe",
      externalInvoiceId: invoice.id,
      kind,
      status: invoice.status ?? "unknown",
      amountXcd: amountFromStripeMinor(amountPaid, currency),
      currency,
      invoiceNumber: invoice.number ?? null,
      periodStart,
      periodEnd,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      stripeSubscriptionId,
      paidAt,
    },
    update: {
      status: invoice.status ?? "unknown",
      amountXcd: amountFromStripeMinor(amountPaid, currency),
      currency,
      invoiceNumber: invoice.number ?? null,
      periodStart,
      periodEnd,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      stripeSubscriptionId,
      paidAt,
    },
  });

  return { customerId, invoiceId: row.id };
}
