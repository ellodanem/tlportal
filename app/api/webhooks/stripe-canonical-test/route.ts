import { coordinateStripeWebhookFulfillment } from "@/lib/billing/stripe-webhook-fulfillment-coordinator";
import { CanonicalStripeExecutionError } from "@/lib/domain/canonical-stripe-execution";
import { tryHandleCanonicalStripeWebhookEvent } from "@/lib/services/canonical-stripe-webhook-service";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  markStripeWebhookRetryRequired,
} from "@/lib/stripe/webhook-handlers";
import {
  CanonicalStripeTestProviderError,
  canonicalStripeTestCurrencyConfiguration,
  constructCanonicalStripeTestWebhookEvent,
} from "@/lib/stripe/canonical-test-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Isolated Stripe test-mode endpoint for canonical provider validation.
 * It never uses the legacy Stripe key/secret and never falls through to legacy fulfillment.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  let event;
  let minorUnitExponent: number;
  try {
    event = constructCanonicalStripeTestWebhookEvent({
      rawBody: await request.text(),
      signature,
    });
    ({ minorUnitExponent } = canonicalStripeTestCurrencyConfiguration(process.env));
  } catch (caught) {
    if (caught instanceof CanonicalStripeTestProviderError || caught instanceof CanonicalStripeExecutionError) {
      const unavailable = [
        "PRODUCTION_EXECUTION_DISABLED",
        "EXECUTION_FEATURE_DISABLED",
        "TEST_PROVIDER_FEATURE_DISABLED",
        "TEST_PROVIDER_CONFIGURATION_MISSING",
        "TEST_SECRET_KEY_REQUIRED",
        "TEST_WEBHOOK_SECRET_REQUIRED",
        "TEST_CURRENCY_REQUIRED",
        "TEST_CURRENCY_PRECISION_REQUIRED",
      ].includes(caught.code);
      return new Response(unavailable ? "Stripe test endpoint is disabled" : "Invalid test-mode Stripe event", {
        status: unavailable ? 503 : 400,
      });
    }
    return new Response("Invalid test-mode Stripe signature", { status: 400 });
  }

  try {
    let handled = false;
    const result = await coordinateStripeWebhookFulfillment(event, {
      claim: claimStripeWebhookEvent,
      fulfill: async (claimedEvent) => {
        handled = await tryHandleCanonicalStripeWebhookEvent(claimedEvent, process.env, { minorUnitExponent });
      },
      complete: (claimedEvent) => completeStripeWebhookEvent(claimedEvent.id),
      retryRequired: (claimedEvent, message) => markStripeWebhookRetryRequired(claimedEvent.id, message),
    });
    return Response.json({ ok: true, duplicate: result.duplicate, handled });
  } catch (caught) {
    console.error("[canonical Stripe test webhook] fulfillment failed", caught);
    return new Response("Stripe test fulfillment failed", { status: 500 });
  }
}
