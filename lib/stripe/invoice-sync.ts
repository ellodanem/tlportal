import "server-only";

import type { BillingInvoiceKind } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { ensureBillingInvoiceDisplayNumber } from "@/lib/billing/invoice-display-number";
import { prisma } from "@/lib/db";
import { syncBillingInvoiceToNativeMirror } from "@/lib/services/stripe-native-invoice-mirror-service";

import { getStripeClient } from "./config";
import { stripeInvoicePeriod } from "./invoice-period";
import { stripeInvoiceSubscriptionId } from "./invoice-subscription";

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

  const subId = stripeInvoiceSubscriptionId(invoice);
  if (subId) {
    const bySub = await prisma.customerSubscription.findUnique({
      where: { stripeSubscriptionId: subId },
      select: { customerId: true, controlMode: true },
    });
    if (bySub?.controlMode === "legacy") return bySub.customerId;

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

    const byStripeCustomer = await prisma.customerSubscription.findFirst({
      where: { stripeCustomerId, controlMode: "legacy" },
      orderBy: { updatedAt: "desc" },
      select: { customerId: true },
    });
    if (byStripeCustomer) return byStripeCustomer.customerId;
  }

  return null;
}

export async function resolveStripeCustomerIdForTlCustomer(
  customerId: string,
): Promise<string | null> {
  const account = await prisma.billingAccount.findUnique({
    where: { customerId_provider: { customerId, provider: "stripe" } },
    select: { externalCustomerId: true },
  });
  const fromAccount = account?.externalCustomerId?.trim();
  if (fromAccount) return fromAccount;

  const sub = await prisma.customerSubscription.findFirst({
    where: { customerId, controlMode: "legacy", stripeCustomerId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { stripeCustomerId: true },
  });
  return sub?.stripeCustomerId?.trim() || null;
}

async function invoiceWithLineItems(invoice: Stripe.Invoice): Promise<Stripe.Invoice> {
  const lines = invoice.lines;
  if (lines?.data && lines.data.length > 0 && lines.has_more !== true) {
    return invoice;
  }
  const stripe = getStripeClient();
  const listed = await stripe.invoices.listLineItems(invoice.id, { limit: 50 });
  return {
    ...invoice,
    lines: {
      object: "list",
      data: listed.data,
      has_more: listed.has_more,
      url: listed.url,
    },
  } as Stripe.Invoice;
}

export async function syncStripeInvoiceToDatabase(
  invoice: Stripe.Invoice,
): Promise<{ customerId: string | null; invoiceId: string | null }> {
  const customerId = await resolveTlCustomerIdFromStripeInvoice(invoice);
  if (!customerId) {
    return { customerId: null, invoiceId: null };
  }

  const currency = (invoice.currency ?? "xcd").toLowerCase();
  const status = (invoice.status ?? "unknown").toLowerCase();
  // Unpaid invoices have amount_paid = 0 after a declined card; store the billed
  // total so the Billing tab does not show EC$0 for open / failed renewals.
  const amountMinor =
    status === "paid"
      ? (invoice.amount_paid ?? invoice.total ?? 0)
      : (invoice.total ?? invoice.amount_due ?? 0);
  const stripeSubscriptionId = stripeInvoiceSubscriptionId(invoice);

  // Keep provider invoices attached to the current commercial agreement. Older
  // migrated/canonical agreements do not always carry Stripe metadata, so use
  // both the legacy subscription id and the canonical provider link.
  const [subscription, providerLink] = stripeSubscriptionId
    ? await Promise.all([
      prisma.customerSubscription.findUnique({
        where: { stripeSubscriptionId },
        select: { id: true, customerId: true },
      }),
      prisma.subscriptionProviderLink.findUnique({
        where: {
          provider_externalSubscriptionId: {
            provider: "stripe",
            externalSubscriptionId: stripeSubscriptionId,
          },
        },
        select: { id: true, customerSubscriptionId: true },
      }),
    ])
    : [null, null];
  const customerSubscriptionId = subscription?.customerId === customerId
    ? subscription.id
    : providerLink?.customerSubscriptionId ?? null;

  const kind: BillingInvoiceKind =
    stripeSubscriptionId != null ? "subscription" : "one_time";

  const { start: periodStart, end: periodEnd } = stripeInvoicePeriod(
    await invoiceWithLineItems(invoice),
  );
  const paidAt =
    invoice.status_transitions?.paid_at != null
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : status === "paid" && invoice.created != null
        ? new Date(invoice.created * 1000)
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
      amountXcd: amountFromStripeMinor(amountMinor, currency),
      currency,
      providerInvoiceNumber: invoice.number ?? null,
      customerSubscriptionId,
      subscriptionProviderLinkId: providerLink?.id ?? null,
      periodStart,
      periodEnd,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      stripeSubscriptionId,
      paidAt,
    },
    update: {
      status: invoice.status ?? "unknown",
      amountXcd: amountFromStripeMinor(amountMinor, currency),
      currency,
      providerInvoiceNumber: invoice.number ?? null,
      customerSubscriptionId,
      subscriptionProviderLinkId: providerLink?.id ?? null,
      periodStart,
      periodEnd,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      stripeSubscriptionId,
      ...(paidAt ? { paidAt } : {}),
    },
  });

  // TL-INV is allocated only after payment (see invoice-display-number).
  if (status === "paid") {
    await ensureBillingInvoiceDisplayNumber(row.id);
  }

  // Native AR mirroring is critical financial fulfillment. Its upserts are
  // replay-safe, so let webhook processing retry when this step fails.
  await syncBillingInvoiceToNativeMirror(row.id);

  return { customerId, invoiceId: row.id };
}
