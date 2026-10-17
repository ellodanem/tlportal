import assert from "node:assert/strict";
import test from "node:test";

import {
  activationReviewLabel,
  assertCanonicalSubscriptionActivationEnabled,
  canonicalProductionManualScopeAuthorized,
  CanonicalSubscriptionActivationError,
} from "../lib/domain/canonical-subscription-activation";

test("canonical activation is explicit in local/test environments and default-deny in production", () => {
  assert.doesNotThrow(() => assertCanonicalSubscriptionActivationEnabled({ NODE_ENV: "test", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" }));
  for (const environment of [
    { NODE_ENV: "test" },
    { NODE_ENV: "production", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" },
    { NODE_ENV: "test", VERCEL_ENV: "production", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" },
  ]) {
    assert.throws(
      () => assertCanonicalSubscriptionActivationEnabled(environment),
      (error: unknown) => error instanceof CanonicalSubscriptionActivationError,
    );
  }
});

test("activation review labels distinguish manual and Stripe collection", () => {
  assert.equal(activationReviewLabel("manual_invoice"), "Manual recurring invoice approval");
  assert.equal(activationReviewLabel("stripe_autocharge"), "Stripe test checkout approval");
});

test("production manual authorization is exact and cannot be enabled by a broad flag", () => {
  const scope = { customerId: "customer-1", subscriptionId: "subscription-1" };
  const environment = {
    NODE_ENV: "production",
    CANONICAL_PRODUCTION_MANUAL_ENABLED: "true",
    CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID: scope.customerId,
    CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID: scope.subscriptionId,
  };
  assert.equal(canonicalProductionManualScopeAuthorized({ scope, environment }), true);
  assert.equal(canonicalProductionManualScopeAuthorized({ scope: { ...scope, subscriptionId: "other" }, environment }), false);
  assert.doesNotThrow(() => assertCanonicalSubscriptionActivationEnabled(environment, scope));
});
