import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_ON_FILE_CHECKOUT_IDEMPOTENCY_VERSION,
  cardOnFileCheckoutBlockers,
  cardOnFileDelayedChargeParams,
  cardOnFileOperationKey,
  isCardOnFileOperationKey,
  isCardOnFileProviderMode,
  leftoverStripeStartFreshDecision,
  type CardOnFileSubject,
  type LeftoverStripeInvoice,
  type LeftoverStripeSubscription,
} from "@/lib/domain/canonical-stripe-card-on-file";

const eligible: CardOnFileSubject = {
  controlMode: "canonical",
  lifecycleStatus: "draft",
  collectionMethod: "stripe_autocharge",
  billingIntervalMonths: 1,
  nextBillingDate: new Date("2026-12-13T00:00:00.000Z"),
  billableItemCount: 1,
  hasOpenStripeLink: false,
  customerEmail: "newmanknight91@gmail.com",
  stripeBillingEnabled: true,
  today: new Date("2026-11-13T15:00:00.000Z"),
};

test("a restored customer draft can collect a card with the first charge after today", () => {
  assert.deepEqual(cardOnFileCheckoutBlockers(eligible), []);
  assert.deepEqual(cardOnFileCheckoutBlockers({ ...eligible, lifecycleStatus: "active", collectionMethod: "manual_invoice" }), []);
  assert.deepEqual(cardOnFileCheckoutBlockers({ ...eligible, lifecycleStatus: "pending_activation" }), []);
});

test("card-on-file checkout is refused without a future first charge or billable services", () => {
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, nextBillingDate: new Date("2026-11-13T00:00:00.000Z") })[0], /after today/);
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, billableItemCount: 0 })[0], /no billable services/);
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, customerEmail: null })[0], /billing email/);
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, hasOpenStripeLink: true })[0], /already has an open Stripe/);
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, controlMode: "legacy" })[0], /subscription workspace/);
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, stripeBillingEnabled: false })[0], /not enabled/);
});

const canceledJuly: LeftoverStripeSubscription = {
  id: "sub_july",
  status: "canceled",
  currentPeriodEnd: "2026-07-21",
  linkedSubscriptionId: null,
};

test("an already canceled Stripe subscription with nothing due can start fresh without confirmation", () => {
  const decision = leftoverStripeStartFreshDecision({ subscriptions: [canceledJuly], openInvoices: [] });
  assert.equal(decision.requiresExplicitCancel, false);
  assert.equal(decision.liveSubscriptions.length, 0);
  assert.equal(decision.canceledSubscriptions.length, 1);
  assert.match(decision.summary, /already canceled/);
});

test("a live unpaid Stripe subscription requires an explicit cancel before a new Checkout", () => {
  const unpaid: LeftoverStripeSubscription = { ...canceledJuly, id: "sub_unpaid", status: "unpaid" };
  const invoice: LeftoverStripeInvoice = { id: "in_open", status: "open", amountDue: "200.00", currency: "XCD" };
  const decision = leftoverStripeStartFreshDecision({ subscriptions: [unpaid], openInvoices: [invoice] });
  assert.equal(decision.requiresExplicitCancel, true);
  assert.equal(decision.liveSubscriptions.length, 1);
  assert.equal(decision.collectibleInvoices.length, 1);
  assert.match(decision.summary, /Cancel/);
});

test("a zero-amount leftover invoice does not require a void", () => {
  const decision = leftoverStripeStartFreshDecision({
    subscriptions: [canceledJuly],
    openInvoices: [{ id: "in_zero", status: "open", amountDue: "0.00", currency: "XCD" }],
  });
  assert.equal(decision.requiresExplicitCancel, false);
  assert.equal(decision.collectibleInvoices.length, 0);
});

test("a live Stripe subscription linked to another TL agreement cannot be canceled from this screen", () => {
  const foreign: LeftoverStripeSubscription = {
    id: "sub_other",
    status: "active",
    currentPeriodEnd: "2026-12-01",
    linkedSubscriptionId: "other-subscription",
  };
  const decision = leftoverStripeStartFreshDecision({ subscriptions: [foreign], openInvoices: [] });
  assert.equal(decision.requiresExplicitCancel, false);
  assert.match(decision.foreignBlocker ?? "", /another TL Portal agreement/);
});

test("ended or paused subscriptions cannot collect a card", () => {
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, lifecycleStatus: "ended" })[0], /draft, pending activation, or active/);
  assert.match(cardOnFileCheckoutBlockers({ ...eligible, lifecycleStatus: "paused" })[0], /draft, pending activation, or active/);
});

test("card-on-file operation keys are namespaced so canonical execution webhooks ignore them", () => {
  assert.equal(cardOnFileOperationKey("sub-1"), "canonical-card-on-file:sub-1");
  assert.equal(isCardOnFileOperationKey("canonical-card-on-file:sub-1"), true);
  assert.equal(isCardOnFileOperationKey("canonical-stripe:sub-1"), false);
  assert.equal(isCardOnFileProviderMode("card_on_file"), true);
  assert.equal(isCardOnFileProviderMode("live_canary"), false);
});

test("a complimentary first period uses trial_end so Stripe accepts a renewal after the next natural billing date", () => {
  const params = cardOnFileDelayedChargeParams(new Date("2026-12-14T00:00:00.000Z"));
  assert.equal(params.trial_end, Date.parse("2026-12-14T00:00:00.000Z") / 1000);
  assert.equal("billing_cycle_anchor" in params, false);
  assert.match(CARD_ON_FILE_CHECKOUT_IDEMPOTENCY_VERSION, /trial-end/);
});
