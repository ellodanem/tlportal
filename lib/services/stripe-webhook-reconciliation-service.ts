import "server-only";

import { coordinateStripeWebhookFulfillment } from "@/lib/billing/stripe-webhook-fulfillment-coordinator";
import { prisma } from "@/lib/db";
import { getStripeClient, isStripeBillingEnabled } from "@/lib/stripe/config";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  handleStripeWebhookEvent,
  markStripeWebhookRetryRequired,
} from "@/lib/stripe/webhook-handlers";

/** Daily reconciliation for critical webhook events left in retry_required. */
export async function reconcileRetryableStripeWebhooks(limit = 25): Promise<{
  checked: number;
  completed: number;
  errors: { eventId: string; message: string }[];
}> {
  if (!isStripeBillingEnabled()) return { checked: 0, completed: 0, errors: [] };

  const rows = await prisma.stripeWebhookEvent.findMany({
    where: { status: "retry_required" },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const stripe = getStripeClient();
  let completed = 0;
  const errors: { eventId: string; message: string }[] = [];

  for (const row of rows) {
    try {
      const event = await stripe.events.retrieve(row.id);
      const result = await coordinateStripeWebhookFulfillment(event, {
        claim: claimStripeWebhookEvent,
        fulfill: handleStripeWebhookEvent,
        complete: (claimedEvent) => completeStripeWebhookEvent(claimedEvent.id),
        retryRequired: (claimedEvent, message) =>
          markStripeWebhookRetryRequired(claimedEvent.id, message),
      });
      if (result.processed) completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook reconciliation failed.";
      errors.push({ eventId: row.id, message });
      await markStripeWebhookRetryRequired(row.id, message);
    }
  }

  return { checked: rows.length, completed, errors };
}
