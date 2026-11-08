import assert from "node:assert/strict";
import test from "node:test";

import { deriveCustomerBillingMode, stripeLinkBlockers, type StripeLinkSubject } from "@/lib/domain/canonical-stripe-link";

const eligible: StripeLinkSubject = {
  controlMode: "canonical",
  lifecycleStatus: "active",
  collectionMethod: "manual_invoice",
  billingIntervalMonths: 1,
  billingAnchorDate: new Date("2026-01-05T00:00:00Z"),
  nextBillingDate: new Date("2026-12-05T00:00:00Z"),
  billableItemCount: 2,
  hasOpenStripeLink: false,
};

test("an active canonical recurring-invoice subscription can be linked to Stripe", () => {
  assert.deepEqual(stripeLinkBlockers(eligible), []);
});

test("linking is refused for anything that is not an active canonical recurring-invoice subscription", () => {
  assert.equal(stripeLinkBlockers({ ...eligible, controlMode: "legacy" }).length, 1);
  assert.equal(stripeLinkBlockers({ ...eligible, lifecycleStatus: "draft" }).length, 1);
  assert.match(stripeLinkBlockers({ ...eligible, collectionMethod: "stripe_autocharge" })[0], /already collected by Stripe/);
  assert.match(stripeLinkBlockers({ ...eligible, collectionMethod: null })[0], /no collection method/);
  assert.match(stripeLinkBlockers({ ...eligible, hasOpenStripeLink: true })[0], /open Stripe relationship/);
});

test("linking needs a full billing cadence and at least one billable service", () => {
  assert.match(stripeLinkBlockers({ ...eligible, nextBillingDate: null })[0], /next renewal date/);
  assert.match(stripeLinkBlockers({ ...eligible, billingIntervalMonths: null })[0], /cadence/);
  assert.match(stripeLinkBlockers({ ...eligible, billableItemCount: 0 })[0], /no billable services/);
});

test("the customer is Stripe when any live subscription is Stripe auto-charge, otherwise manual", () => {
  assert.equal(deriveCustomerBillingMode(["manual_invoice", "stripe_autocharge"]), "stripe_subscription");
  assert.equal(deriveCustomerBillingMode(["manual_invoice", null]), "manual_legacy");
  assert.equal(deriveCustomerBillingMode([]), "manual_legacy");
});
