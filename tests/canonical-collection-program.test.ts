import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COLLECTION_CARD_LINK_LEAD_DAYS,
  collectionCardLinkStartDate,
  collectionDailyAction,
  showSubscriptionCollectionTab,
  utcDayString,
} from "@/lib/domain/canonical-collection-program";

const due = new Date("2026-12-19T00:00:00.000Z");
const armed = {
  firstChargeDate: due,
  status: "armed" as const,
  hasOpenStripeLink: false,
  lastCardLinkSentOn: null,
  lastPayNowSentOn: null,
};

test("card-on-file window starts three days before the first charge", () => {
  assert.equal(COLLECTION_CARD_LINK_LEAD_DAYS, 3);
  assert.equal(utcDayString(collectionCardLinkStartDate(due)), "2026-12-16");
});

test("an armed program stays quiet until three days before the first charge", () => {
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-11-20T15:00:00.000Z") }), "none");
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-15T12:00:00.000Z") }), "none");
});

test("the daily job sends card-on-file Checkout each day in the lead window", () => {
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-16T08:00:00.000Z") }), "send_card_on_file");
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-17T08:00:00.000Z"), lastCardLinkSentOn: new Date("2026-12-16T00:00:00.000Z") }), "send_card_on_file");
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-16T08:00:00.000Z"), lastCardLinkSentOn: new Date("2026-12-16T00:00:00.000Z") }), "none");
});

test("on the due date a missing card switches to pay-now Checkout", () => {
  assert.equal(collectionDailyAction({
    ...armed,
    today: new Date("2026-12-19T08:00:00.000Z"),
    lastCardLinkSentOn: new Date("2026-12-18T00:00:00.000Z"),
  }), "send_pay_now");
  assert.equal(collectionDailyAction({
    ...armed,
    today: new Date("2026-12-19T08:00:00.000Z"),
    lastPayNowSentOn: new Date("2026-12-19T00:00:00.000Z"),
  }), "none");
  assert.equal(collectionDailyAction({
    ...armed,
    today: new Date("2026-12-20T08:00:00.000Z"),
    lastPayNowSentOn: new Date("2026-12-19T00:00:00.000Z"),
  }), "send_pay_now");
});

test("a saved card ends the program", () => {
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-16T08:00:00.000Z"), hasOpenStripeLink: true }), "complete");
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-19T08:00:00.000Z"), status: "canceled" }), "none");
});

test("arming on or after the due date goes straight to pay-now", () => {
  assert.equal(collectionDailyAction({ ...armed, today: new Date("2026-12-19T00:00:00.000Z") }), "send_pay_now");
});

test("the Collection tab is for card billing, an armed program, or a live canonical agreement", () => {
  assert.equal(showSubscriptionCollectionTab({ collectionMethod: "stripe_autocharge", hasCollectionProgram: false }), true);
  assert.equal(showSubscriptionCollectionTab({ collectionMethod: "manual_invoice", hasCollectionProgram: true }), true);
  assert.equal(showSubscriptionCollectionTab({ collectionMethod: "manual_invoice", hasCollectionProgram: false }), false);
  assert.equal(showSubscriptionCollectionTab({
    collectionMethod: "manual_invoice",
    hasCollectionProgram: false,
    controlMode: "canonical",
    lifecycleStatus: "active",
  }), true);
  assert.equal(showSubscriptionCollectionTab({
    collectionMethod: "manual_invoice",
    hasCollectionProgram: false,
    controlMode: "canonical",
    lifecycleStatus: "ended",
  }), false);
});

test("Collection can send pay-now Checkout without switching collection first", async () => {
  const tab = await readFile("components/admin/canonical-subscription/collection-tab.tsx", "utf8");
  assert.match(tab, /CollectPayNowPanel/);
  assert.doesNotMatch(tab, /Set collection to automatic card billing on Billing first/);
  const actions = await readFile("app/admin/subscriptions/canonical/actions.ts", "utf8");
  assert.match(actions, /startStripePayNowCheckoutAction/);
  assert.match(actions, /sendStaffPayNowCheckout/);
});

test("the daily billing cron sends Collection Checkout without the reminder flag", async () => {
  const source = await readFile("app/api/cron/billing-whatsapp-reminders/route.ts", "utf8");
  assert.match(source, /processCanonicalCollectionPrograms\(\)/);
  assert.match(source, /const \[reminders, collection\] = await Promise\.all/);
  assert.doesNotMatch(source, /if \(SCHEDULED_PAYMENT_REMINDERS_ENABLED/);
});
