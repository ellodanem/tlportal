import { getStripeClient, stripeWebhookSecret } from "@/lib/stripe/config";
import { coordinateStripeWebhookFulfillment } from "@/lib/billing/stripe-webhook-fulfillment-coordinator";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  handleStripeWebhookEvent,
  markStripeWebhookRetryRequired,
} from "@/lib/stripe/webhook-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST — Stripe webhooks. Configure in Stripe Dashboard:
 * `https://<host>/api/webhooks/stripe`
 *
 * Requires `STRIPE_WEBHOOK_SECRET` (whsec_… from `stripe listen` or Dashboard).
 *
 * Subscribe to: checkout.session.completed, checkout.session.expired,
 * customer.subscription.*, invoice.paid, invoice.finalized,
 * invoice.payment_failed, invoice.voided, payment_intent.payment_failed,
 * payment_intent.succeeded.
 */
export async function POST(req: Request) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    return new Response("STRIPE_WEBHOOK_SECRET is not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid signature";
    return new Response(msg, { status: 400 });
  }

  try {
    const result = await coordinateStripeWebhookFulfillment(event, {
      claim: claimStripeWebhookEvent,
      fulfill: handleStripeWebhookEvent,
      complete: (claimedEvent) => completeStripeWebhookEvent(claimedEvent.id),
      retryRequired: (claimedEvent, message) =>
        markStripeWebhookRetryRequired(claimedEvent.id, message),
    });
    return Response.json({ ok: true, duplicate: result.duplicate });
  } catch (e) {
    console.error("[stripe webhook] handler error", e);
    return new Response("Handler error", { status: 500 });
  }
}
