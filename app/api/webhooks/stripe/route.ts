import { getStripeClient, stripeWebhookSecret } from "@/lib/stripe/config";
import { handleStripeWebhookEvent, recordStripeWebhookIfNew } from "@/lib/stripe/webhook-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — Stripe webhooks. Configure in Stripe Dashboard:
 * `https://<host>/api/webhooks/stripe`
 *
 * Requires `STRIPE_WEBHOOK_SECRET` (whsec_… from `stripe listen` or Dashboard).
 *
 * Subscribe to: checkout.session.completed, customer.subscription.*,
 * invoice.paid, invoice.finalized, invoice.payment_failed, invoice.voided.
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

  const isNew = await recordStripeWebhookIfNew(event);
  if (!isNew) {
    return Response.json({ ok: true, duplicate: true });
  }

  try {
    await handleStripeWebhookEvent(event);
  } catch (e) {
    console.error("[stripe webhook] handler error", e);
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ ok: true });
}
