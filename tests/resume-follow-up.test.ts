import assert from "node:assert/strict";
import test from "node:test";

import { resumeFollowUp } from "../lib/domain/resume-follow-up";

const stripeSub = { id: "sub-a", collectionMethod: "stripe_autocharge" };
const manualSub = { id: "sub-b", collectionMethod: "manual_invoice" };

test("resuming a device missing from the customer's only subscription points to Add service, then Stripe", () => {
  const followUp = resumeFollowUp({ customerId: "kurt", billingMode: "stripe_subscription", assignmentLinked: false, canonicalSubscriptions: [stripeSub] });
  assert.equal(followUp?.href, "/admin/subscriptions/canonical/sub-a/add-service");
  assert.equal(followUp?.linkLabel, "Add to subscription");
  assert.match(followUp?.text ?? "", /will not be billed/);
  assert.match(followUp?.text ?? "", /Stripe vehicle quantity/);
});

test("with several subscriptions staff choose one from the customer page", () => {
  const followUp = resumeFollowUp({ customerId: "kurt", billingMode: "manual_legacy", assignmentLinked: false, canonicalSubscriptions: [manualSub, { id: "sub-c", collectionMethod: "manual_invoice" }] });
  assert.equal(followUp?.href, "/admin/customers/kurt/subscriptions");
  assert.doesNotMatch(followUp?.text ?? "", /Stripe/);
});

test("a legacy card customer is sent to update the Stripe quantity", () => {
  const followUp = resumeFollowUp({ customerId: "kurt", billingMode: "stripe_subscription", assignmentLinked: false, canonicalSubscriptions: [] });
  assert.equal(followUp?.href, "/admin/subscriptions/kurt/renewals");
  assert.equal(followUp?.linkLabel, "Update Stripe quantity");
});

test("a linked service on a card subscription goes to that subscription's Stripe check", () => {
  const followUp = resumeFollowUp({ customerId: "kurt", billingMode: "stripe_subscription", assignmentLinked: true, canonicalSubscriptions: [stripeSub, manualSub] });
  assert.equal(followUp?.href, "/admin/subscriptions/canonical/sub-a");
});

test("manual-invoice customers with no subscription gap need no follow-up", () => {
  assert.equal(resumeFollowUp({ customerId: "kurt", billingMode: "manual_legacy", assignmentLinked: false, canonicalSubscriptions: [] }), null);
  assert.equal(resumeFollowUp({ customerId: "kurt", billingMode: "manual_legacy", assignmentLinked: true, canonicalSubscriptions: [manualSub] }), null);
});
