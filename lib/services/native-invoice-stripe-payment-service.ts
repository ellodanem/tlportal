import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { recordInvoicePayment } from "@/lib/services/native-invoice-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

import { getStripeClient } from "@/lib/stripe/config";

/**
 * Record a native invoice payment from a completed Stripe Checkout (mode: payment).
 * Idempotent on PaymentIntent id.
 */
export type NativeInvoiceStripePaymentDependencies = {
  retrievePaymentIntent?: (paymentIntentId: string) => Promise<Pick<
    Stripe.PaymentIntent,
    "status" | "amount_received" | "amount"
  >>;
};

export async function recordNativeInvoiceStripeCheckout(
  session: Stripe.Checkout.Session,
  dependencies: NativeInvoiceStripePaymentDependencies = {},
): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.tl_checkout_kind !== "native_invoice") return;

  const invoiceId = session.metadata?.tl_invoice_id?.trim();
  if (!invoiceId) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return;

  const existing = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true },
  });
  if (existing) return;

  const retrievePaymentIntent = dependencies.retrievePaymentIntent ?? (async (id: string) => {
    const stripe = getStripeClient();
    return stripe.paymentIntents.retrieve(id);
  });
  const paymentIntent = await retrievePaymentIntent(paymentIntentId);
  if (paymentIntent.status !== "succeeded") return;

  const amount = (paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100;
  if (!(amount > 0)) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, number: true, customerId: true, status: true, amountDue: true },
  });
  if (!invoice) return;
  if (invoice.status === "void" || invoice.status === "written_off" || invoice.status === "paid") return;

  try {
    await recordInvoicePayment({
      invoiceId: invoice.id,
      amount,
      method: "stripe",
      reference: session.id,
      stripePaymentIntentId: paymentIntentId,
      notes: "Stripe Checkout",
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return;
    throw error;
  }

  await recordOperationalEvent({
    category: "billing",
    customerId: invoice.customerId ?? undefined,
    summary: `Native invoice paid online${invoice.number ? ` — ${invoice.number}` : ""}`,
    payload: {
      invoiceId: invoice.id,
      checkoutSessionId: session.id,
      paymentIntentId,
      amount,
    },
  });
}
