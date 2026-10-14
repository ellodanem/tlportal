export type StripeWebhookClaim = { claimed: true } | { claimed: false; reason: "completed" | "in_progress" };

export type StripeWebhookFulfillmentDependencies<TEvent> = {
  claim: (event: TEvent) => Promise<StripeWebhookClaim>;
  fulfill: (event: TEvent) => Promise<void>;
  complete: (event: TEvent) => Promise<void>;
  retryRequired: (event: TEvent, message: string) => Promise<void>;
};

export type StripeWebhookFulfillmentResult =
  | { processed: true; duplicate: false }
  | { processed: false; duplicate: true };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Webhook fulfillment failed.";
}

/** Critical fulfillment is acknowledged only after every critical step succeeds. */
export async function coordinateStripeWebhookFulfillment<TEvent>(
  event: TEvent,
  dependencies: StripeWebhookFulfillmentDependencies<TEvent>,
): Promise<StripeWebhookFulfillmentResult> {
  const claim = await dependencies.claim(event);
  if (!claim.claimed) return { processed: false, duplicate: true };

  try {
    await dependencies.fulfill(event);
    await dependencies.complete(event);
    return { processed: true, duplicate: false };
  } catch (error) {
    await dependencies.retryRequired(event, errorMessage(error));
    throw error;
  }
}
