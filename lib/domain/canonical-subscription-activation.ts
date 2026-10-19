import type { SubscriptionCollectionMethod } from "@prisma/client";

export const CANONICAL_SUBSCRIPTION_ACTIVATION_FLAG = "CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED";
/** One global production gate. Individual customer IDs are never used for normal operations. */
export const CANONICAL_SUBSCRIPTION_OPERATIONS_FLAG = "CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED";
export const CANONICAL_PRODUCTION_MANUAL_ENABLED = "CANONICAL_PRODUCTION_MANUAL_ENABLED";
export const CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID = "CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID";
export const CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID = "CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID";

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
  CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED?: string;
  /**
   * Narrow production exception used only to promote a migration shadow with
   * deferred billing. It never enables normal staff activation or charging.
   */
  CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED?: string;
  CANONICAL_PRODUCTION_MANUAL_ENABLED?: string;
  CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID?: string;
  CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID?: string;
};

export type CanonicalProductionManualScope = { customerId: string; subscriptionId: string };

export function canonicalSubscriptionOperationsEnabled(
  environment: CanonicalSubscriptionActivationEnvironment = process.env,
): boolean {
  return environment.CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED === "true";
}

/** Absent or partial configuration is never treated as production authorization. */
export function canonicalProductionManualScopeAuthorized(input: {
  scope: CanonicalProductionManualScope;
  environment?: CanonicalSubscriptionActivationEnvironment;
}): boolean {
  const environment = input.environment ?? process.env;
  return environment.CANONICAL_PRODUCTION_MANUAL_ENABLED === "true"
    && environment.CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID === input.scope.customerId
    && environment.CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID === input.scope.subscriptionId;
}

/**
 * Activation changes commercial state and may arm a future recurring schedule.
 * It is test/local only until a separately approved production financial pilot.
 */
export function assertCanonicalSubscriptionActivationEnabled(
  environment: CanonicalSubscriptionActivationEnvironment = process.env,
  scope?: CanonicalProductionManualScope,
  options?: { migrationPromotion?: boolean },
): void {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    if (canonicalSubscriptionOperationsEnabled(environment)) return;
    if (options?.migrationPromotion && environment.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED === "true") return;
    // Preserve the existing narrow pilot authorization until it can be retired
    // under its own approved cutover. It is not used by normal onboarding.
    if (scope && canonicalProductionManualScopeAuthorized({ scope, environment })) return;
    throw new CanonicalSubscriptionActivationError(
      "PRODUCTION_ACTIVATION_DISABLED",
      "Canonical activation is disabled in production until normal staff operations are enabled.",
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
