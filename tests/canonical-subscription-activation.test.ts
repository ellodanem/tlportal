import assert from "node:assert/strict";
import test from "node:test";

import {
  activationReviewLabel,
  assertCanonicalSubscriptionActivationEnabled,
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
