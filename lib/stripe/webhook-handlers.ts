import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { advanceAssignmentsOnStripeInvoicePaid } from "@/lib/services/assignment-renewal-service";
import {
  mirrorStripePaidInvoiceToInvoiless,
  recordInvoilessMirrorEvent,
} from "@/lib/services/invoiless-stripe-mirror-service";
import { recordNativeInvoiceStripeCheckout } from "@/lib/services/native-invoice-stripe-payment-service";
import { generateAndStorePaidInvoicePdf } from "@/lib/services/billing-paid-pdf-service";
import { autoEmailPaidInvoiceReceiptAfterPayment } from "@/lib/services/billing-paid-receipt-email-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

import { getStripeClient } from "./config";
import { handleCheckoutSessionExpired } from "./checkout-recovery";
import { syncStripeInvoiceToDatabase } from "./invoice-sync";
import { markStripeSubscriptionCanceled, syncStripeSubscriptionToDatabase } from "./subscription-sync";

async function loadSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionExpired(session);
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.metadata?.tl_checkout_kind === "native_invoice") {
        try {
          await recordNativeInvoiceStripeCheckout(session);
        } catch (e) {
          console.error("[stripe webhook] native invoice payment failed", e);
        }
        break;
      }
      const tlCustomerId = session.metadata?.tl_customer_id?.trim();
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (subId) {
        const sub = await loadSubscription(subId);
        const { customerId } = await syncStripeSubscriptionToDatabase(sub);
        try {
          const stripe = getStripeClient();
          const latestInv = await stripe.invoices.list({
            subscription: subId,
            limit: 1,
          });
          const inv = latestInv.data[0];
          if (inv) {
            await syncStripeInvoiceToDatabase(inv);
          }
        } catch {
          // Non-fatal; invoice.paid webhook will mirror later
        }
        if (customerId) {
          await recordOperationalEvent({
            category: "billing.synced",
            summary: "Stripe Checkout completed — subscription linked",
            customerId,
            payload: { provider: "stripe", subscriptionId: subId },
          });
        }
      } else if (tlCustomerId) {
        await recordOperationalEvent({
          category: "billing.synced",
          summary: "Stripe Checkout completed",
          customerId: tlCustomerId,
          payload: { sessionId: session.id },
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const { customerId } = await syncStripeSubscriptionToDatabase(sub);
      if (customerId && event.type === "customer.subscription.updated") {
        await recordOperationalEvent({
          category: "billing.synced",
          summary: `Stripe subscription ${sub.status}`,
          customerId,
          payload: { subscriptionId: sub.id, status: sub.status },
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await markStripeSubscriptionCanceled(sub);
      const tlCustomerId = sub.metadata?.tl_customer_id?.trim();
      if (tlCustomerId) {
        await recordOperationalEvent({
          category: "billing.synced",
          summary: "Stripe subscription canceled",
          customerId: tlCustomerId,
          payload: { subscriptionId: sub.id },
        });
      }
      break;
    }
    case "invoice.paid":
    case "invoice.finalized":
    case "invoice.payment_failed":
    case "invoice.voided": {
      const invoice = event.data.object as Stripe.Invoice;
      const { customerId, invoiceId: tlBillingInvoiceId } = await syncStripeInvoiceToDatabase(invoice);
      const subId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
      if (subId) {
        const sub = await loadSubscription(subId);
        await syncStripeSubscriptionToDatabase(sub);
      }
      if (customerId && event.type === "invoice.paid") {
        await recordOperationalEvent({
          category: "billing.synced",
          summary: `Stripe invoice paid${invoice.number ? ` — ${invoice.number}` : ""}`,
          customerId,
          payload: {
            provider: "stripe",
            invoiceId: invoice.id,
            amountPaid: invoice.amount_paid,
          },
        });
        try {
          const mirrorResult = await mirrorStripePaidInvoiceToInvoiless({
            stripeInvoice: invoice,
            customerId,
            tlBillingInvoiceId,
          });
          await recordInvoilessMirrorEvent(customerId, invoice.id, mirrorResult);
        } catch (e) {
          console.error("[stripe webhook] Invoiless paid mirror failed", e);
          await recordOperationalEvent({
            category: "billing.synced",
            summary: "Invoiless paid mirror error",
            customerId,
            payload: {
              stripeInvoiceId: invoice.id,
              error: e instanceof Error ? e.message : "Unknown error",
            },
          });
        }
        try {
          const { advanced, skipped } = await advanceAssignmentsOnStripeInvoicePaid(
            customerId,
            invoice.id,
          );
          if (advanced > 0) {
            await recordOperationalEvent({
              category: "renewal.paid",
              summary: `Renewal ladder advanced (${advanced} device${advanced === 1 ? "" : "s"})`,
              customerId,
              payload: { stripeInvoiceId: invoice.id, advanced, skipped },
            });
          }
        } catch (e) {
          console.error("[stripe webhook] renewal auto-advance failed", e);
        }
        if (tlBillingInvoiceId) {
          try {
            const pdfResult = await generateAndStorePaidInvoicePdf(tlBillingInvoiceId);
            if (!pdfResult.ok) {
              console.error("[stripe webhook] paid PDF failed", pdfResult.error);
            } else {
              try {
                const emailResult = await autoEmailPaidInvoiceReceiptAfterPayment(tlBillingInvoiceId);
                if (!emailResult.ok) {
                  console.error("[stripe webhook] paid receipt email failed", emailResult.error);
                } else if ("skipped" in emailResult && emailResult.skipped) {
                  console.info("[stripe webhook] paid receipt email skipped", emailResult.reason);
                }
              } catch (e) {
                console.error("[stripe webhook] paid receipt email failed", e);
              }
            }
          } catch (e) {
            console.error("[stripe webhook] paid PDF failed", e);
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

export async function recordStripeWebhookIfNew(event: Stripe.Event): Promise<boolean> {
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
    return true;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return false;
    }
    throw e;
  }
}
