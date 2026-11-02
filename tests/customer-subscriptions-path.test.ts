import assert from "node:assert/strict";
import test from "node:test";

import { customerSubscriptionsPath } from "../lib/admin/customer-subscriptions-path";
import { buildSubscriptionWorkspace, parseWorkspaceSearchParams } from "../lib/domain/canonical-subscription-workspace";

test("one subscription opens its own page", () => {
  assert.equal(customerSubscriptionsPath("c1", ["s1"]), "/admin/subscriptions/canonical/s1");
});

test("several subscriptions open the Subscriptions list narrowed to that customer id", () => {
  assert.equal(customerSubscriptionsPath("c 1", ["s1", "s2"]), "/admin/subscriptions/canonical?customer=c%201");
});

test("no canonical subscriptions falls back to the customer's lifecycle page", () => {
  assert.equal(customerSubscriptionsPath("c1", []), "/admin/subscriptions/c1");
});

test("the customer param is read from the URL and filters the workspace by id", () => {
  assert.equal(parseWorkspaceSearchParams({ customer: " c1 " }).customerId, "c1");
  assert.equal(parseWorkspaceSearchParams({}).customerId, "");
  const rows = [
    { id: "s1", customerId: "c1", customer: "Plastic Solutions Ltd" },
    { id: "s2", customerId: "c1", customer: "Plastic Solutions Ltd" },
    { id: "s3", customerId: "c2", customer: "Plastic Solutions Ltd" },
  ].map((row) => ({
    ...row, name: "GPS tracking", reference: null, controlMode: "canonical", historical: false,
    billingIntervalMonths: 1, itemCount: 1, normalizedMrr: "30", nextBillingDate: null,
  })) as unknown as Parameters<typeof buildSubscriptionWorkspace>[0];
  const result = buildSubscriptionWorkspace(rows, { customerId: "c1" });
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].rows.map((row) => row.id).sort(), ["s1", "s2"]);
});
