import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";

import { getAppBaseUrl } from "./app-url";
import { xcdToStripeUnitAmount } from "./checkout-pricing";
import { getStripeClient, isStripeBillingEnabled } from "./config";

const PAYABLE_STATUSES = new Set(["open", "partially_paid", "overdue"]);

export async function createNativeInvoiceCheckoutSession(publicToken: string): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  if (!isStripeBillingEnabled()) {
    return { ok: false, error: "Online card payment is not available right now." };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken },
    select: {
      id: true,
      number: true,
      status: true,
      currency: true,
      amountDue: true,
      allowOnlinePayment: true,
      customerId: true,
      customer: { select: { email: true } },
    },
  });

  if (!invoice) {
    return { ok: false, error: "Invoice not found." };
  }
  if (!invoice.allowOnlinePayment) {
    return { ok: false, error: "This invoice does not accept online card payment." };
  }
  if (!PAYABLE_STATUSES.has(invoice.status)) {
    return { ok: false, error: "This invoice is not open for payment." };
  }

  const amountDue = Number(invoice.amountDue);
  if (!(amountDue > 0)) {
    return { ok: false, error: "Nothing is due on this invoice." };
  }

  const stripe = getStripeClient();
  const base = getAppBaseUrl();
  const currency = (invoice.currency || "XCD").toLowerCase();
  const invoiceLabel = invoice.number ?? "Invoice";

  const meta: Record<string, string> = {
    tl_invoice_id: invoice.id,
    tl_public_token: publicToken,
    tl_checkout_kind: "native_invoice",
  };
  if (invoice.customerId) {
    meta.tl_customer_id = invoice.customerId;
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: `${invoiceLabel} — Track Lucia` },
          unit_amount: xcdToStripeUnitAmount(amountDue),
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/pay/i/${encodeURIComponent(publicToken)}?paid=1`,
    cancel_url: `${base}/pay/i/${encodeURIComponent(publicToken)}`,
    metadata: meta,
    payment_intent_data: { metadata: meta },
  };

  const customerEmail = invoice.customer?.email?.trim();
  if (invoice.customerId) {
    const account = await prisma.billingAccount.findUnique({
      where: {
        customerId_provider: { customerId: invoice.customerId, provider: "stripe" },
      },
      select: { externalCustomerId: true },
    });
    if (account?.externalCustomerId) {
      params.customer = account.externalCustomerId;
    } else if (customerEmail) {
      params.customer_email = customerEmail;
    }
  } else if (customerEmail) {
    params.customer_email = customerEmail;
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    return { ok: false, error: "Could not start card payment." };
  }

  return { ok: true, url: session.url };
}
