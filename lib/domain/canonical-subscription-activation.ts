import type { SubscriptionCollectionMethod } from "@prisma/client";

export const CANONICAL_SUBSCRIPTION_ACTIVATION_FLAG = "CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED";

export class CanonicalSubscriptionActivationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CanonicalSubscriptionActivationError";
  }
}

export type CanonicalSubscriptionActivationEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED?: string;
};

/**
 * Activation changes commercial state and may arm a future recurring schedule.
 * It is test/local only until a separately approved production financial pilot.
 */
export function assertCanonicalSubscriptionActivationEnabled(
  environment: CanonicalSubscriptionActivationEnvironment = process.env,
): void {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    throw new CanonicalSubscriptionActivationError(
      "PRODUCTION_ACTIVATION_DISABLED",
      "Canonical activation is disabled in production pending an explicitly approved financial pilot.",
    );
  }
  if (environment.CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED !== "true") {
    throw new CanonicalSubscriptionActivationError(
      "FEATURE_DISABLED",
      `${CANONICAL_SUBSCRIPTION_ACTIVATION_FLAG}=true is required for local or test activation.`,
    );
  }
}

export function activationReviewLabel(method: SubscriptionCollectionMethod | null): string {
  return method === "stripe_autocharge"
    ? "Stripe test checkout approval"
    : "Manual recurring invoice approval";
}
