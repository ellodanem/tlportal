import assert from "node:assert/strict";
import test from "node:test";

import {
  billableServiceCountAtRenewal,
  evaluateCanonicalStripeQuantity,
  type QuantityCheckSync,
} from "../lib/domain/canonical-stripe-quantity-check";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const renewal = day("2026-11-15");

function item(overrides: Partial<{ status: string; billingEffectiveFrom: Date | null; billingEffectiveUntil: Date | null }> = {}) {
  return { status: "active", billingEffectiveFrom: day("2026-10-15"), billingEffectiveUntil: null, ...overrides };
}

function sync(overrides: Partial<QuantityCheckSync> = {}): QuantityCheckSync {
  return {
    state: "differs",
    reason: "Stripe track: TL 5 · Stripe 4 (1 month).",
    canPush: true,
    tlVehicleCount: 5,
    stripeQuantity: 4,
    stripeSubscriptionId: "sub_1",
    ...overrides,
  };
}

test("billable service count includes services joining on the renewal and skips ended or later ones", () => {
  const count = billableServiceCountAtRenewal([
    item(),
    item({ billingEffectiveFrom: renewal }),
    item({ billingEffectiveFrom: day("2026-12-15") }),
    item({ billingEffectiveUntil: renewal }),
    item({ status: "ended" }),
    item({ status: "canceled" }),
    item({ billingEffectiveFrom: null }),
  ], renewal);
  assert.equal(count, 2);
  assert.equal(billableServiceCountAtRenewal([item()], null), 0);
});

test("a resumed vehicle added as a fifth service flags Stripe still billing four, with a safe push", () => {
  const check = evaluateCanonicalStripeQuantity({ serviceCount: 5, linkedExternalSubscriptionId: "sub_1", sync: sync() });
  assert.deepEqual(check, { state: "differs", serviceCount: 5, stripeQuantity: 4, deviceCount: 5, pushMatchesServices: true });
});

test("push is withheld when the device count it would send differs from the services", () => {
  const check = evaluateCanonicalStripeQuantity({ serviceCount: 4, linkedExternalSubscriptionId: "sub_1", sync: sync({ stripeQuantity: 3 }) });
  assert.equal(check.state, "differs");
  assert.equal(check.state === "differs" && check.pushMatchesServices, false);
});

test("Stripe matching the services is in sync even when the device count differs", () => {
  const check = evaluateCanonicalStripeQuantity({ serviceCount: 4, linkedExternalSubscriptionId: "sub_1", sync: sync({ stripeQuantity: 4 }) });
  assert.deepEqual(check, { state: "in_sync", serviceCount: 4, stripeQuantity: 4 });
});

test("a different or missing Stripe subscription is never compared", () => {
  assert.equal(evaluateCanonicalStripeQuantity({ serviceCount: 5, linkedExternalSubscriptionId: null, sync: sync() }).state, "unavailable");
  assert.equal(evaluateCanonicalStripeQuantity({ serviceCount: 5, linkedExternalSubscriptionId: "sub_2", sync: sync() }).state, "unavailable");
  const unreadable = evaluateCanonicalStripeQuantity({
    serviceCount: 5,
    linkedExternalSubscriptionId: "sub_1",
    sync: sync({ state: "unavailable", stripeQuantity: null, reason: "Could not load Stripe subscription." }),
  });
  assert.deepEqual(unreadable, { state: "unavailable", serviceCount: 5, reason: "Could not load Stripe subscription." });
});

test("a past-due Stripe subscription still shows the mismatch but cannot be pushed", () => {
  const check = evaluateCanonicalStripeQuantity({
    serviceCount: 5,
    linkedExternalSubscriptionId: "sub_1",
    sync: sync({ state: "unavailable", canPush: false, reason: "Stripe subscription status is “past_due”." }),
  });
  assert.equal(check.state === "differs" && check.pushMatchesServices, false);
});
