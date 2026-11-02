import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStripeQuantityAlertSms,
  classifyStripeQuantityFindings,
  driftSignature,
  STRIPE_QUANTITY_DRIFT_EVENT,
  STRIPE_QUANTITY_DRIFT_RESOLVED_EVENT,
  stripeQuantityReviewPath,
  type PreviousDriftState,
  type StripeQuantityFinding,
} from "../lib/domain/stripe-quantity-audit";

function finding(overrides: Partial<StripeQuantityFinding> = {}): StripeQuantityFinding {
  return {
    customerId: "kurt",
    customerName: "Kurt Dieudonna",
    source: "canonical",
    subscriptionId: "sub-canonical",
    stripeSubscriptionId: "sub_1",
    expectedQuantity: 5,
    stripeQuantity: 4,
    pushSafe: true,
    ...overrides,
  };
}

const drift = (signature: string): PreviousDriftState => ({ category: STRIPE_QUANTITY_DRIFT_EVENT, signature });

test("a first-seen drift is new; the same drift the next night is not", () => {
  const current = finding();
  const first = classifyStripeQuantityFindings({ findings: [current], previous: new Map(), checkedCustomerIds: new Set(["kurt"]) });
  assert.equal(first.newOrChanged.length, 1);

  const again = classifyStripeQuantityFindings({
    findings: [current],
    previous: new Map([["kurt", drift(driftSignature(current))]]),
    checkedCustomerIds: new Set(["kurt"]),
  });
  assert.equal(again.newOrChanged.length, 0);
  assert.deepEqual(again.resolvedCustomerIds, []);
});

test("a drift with different numbers counts as changed", () => {
  const result = classifyStripeQuantityFindings({
    findings: [finding({ expectedQuantity: 6 })],
    previous: new Map([["kurt", drift(driftSignature(finding()))]]),
    checkedCustomerIds: new Set(["kurt"]),
  });
  assert.equal(result.newOrChanged.length, 1);
});

test("a fixed drift is resolved, and the same drift returning later alerts again", () => {
  const resolved = classifyStripeQuantityFindings({
    findings: [],
    previous: new Map([["kurt", drift(driftSignature(finding()))]]),
    checkedCustomerIds: new Set(["kurt"]),
  });
  assert.deepEqual(resolved.resolvedCustomerIds, ["kurt"]);

  const returned = classifyStripeQuantityFindings({
    findings: [finding()],
    previous: new Map([["kurt", { category: STRIPE_QUANTITY_DRIFT_RESOLVED_EVENT, signature: null }]]),
    checkedCustomerIds: new Set(["kurt"]),
  });
  assert.equal(returned.newOrChanged.length, 1);
});

test("a customer Stripe could not be read tonight keeps its open drift", () => {
  const result = classifyStripeQuantityFindings({
    findings: [],
    previous: new Map([["kurt", drift(driftSignature(finding()))]]),
    checkedCustomerIds: new Set(),
  });
  assert.deepEqual(result.resolvedCustomerIds, []);
});

test("review links go to the canonical subscription or the legacy renewals page", () => {
  assert.equal(stripeQuantityReviewPath(finding()), "/admin/subscriptions/canonical/sub-canonical");
  assert.equal(stripeQuantityReviewPath(finding({ source: "legacy", subscriptionId: null })), "/admin/subscriptions/kurt/renewals");
});

test("the staff SMS marks new drifts and caps the list", () => {
  const many = Array.from({ length: 7 }, (_, index) => finding({ customerId: `c${index}`, customerName: `Customer ${index}` }));
  const body = buildStripeQuantityAlertSms({ findings: many, newCustomerIds: new Set(["c0"]), baseUrl: "https://tl.example" });
  assert.match(body, /differs for 7 customers/);
  assert.match(body, /NEW Customer 0: Stripe bills 4, TL expects 5\nhttps:\/\/tl\.example\/admin\/subscriptions\/canonical\/sub-canonical/);
  assert.doesNotMatch(body, /NEW Customer 1/);
  assert.doesNotMatch(body, /Customer 5/);
  assert.match(body, /…and 2 more\./);
});
