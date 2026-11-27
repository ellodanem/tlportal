import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CanonicalSubscriptionValidationError,
} from "../lib/domain/canonical-subscription-application";
import {
  defaultTermRetargetInterval,
  destinationAgreementName,
  planTermRetarget,
  suggestedSuccessorCycleAmount,
  termRetargetBlockers,
  type TermRetargetSnapshot,
} from "../lib/domain/canonical-term-retarget";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function overdueSixMonth(overrides: Partial<TermRetargetSnapshot> = {}): TermRetargetSnapshot {
  return {
    id: "sub-6",
    name: "Every 6 months GPS tracking",
    customerId: "cust-1",
    controlMode: "canonical",
    lifecycleStatus: "active",
    collectionMethod: "manual_invoice",
    billingIntervalMonths: 6,
    currency: "XCD",
    nextBillingDate: d("2026-05-27"),
    hasMigrationLedger: false,
    hasOpenStripeLink: false,
    customerEmail: "billing@example.com",
    stripeBillingEnabled: true,
    liveServices: [{
      id: "item-1",
      label: "HQ1001",
      status: "active",
      currentAmount: "150.00",
      currentIntervalMonths: 6,
    }],
    openInvoices: [{
      id: "inv-1",
      number: "INV-1042",
      amountDue: "150.00",
      currency: "XCD",
      status: "overdue",
    }],
    ...overrides,
  };
}

test("a 6-month amount scales to a 3-month successor with half-up cents", () => {
  assert.equal(suggestedSuccessorCycleAmount("150.00", 6, 3).toFixed(2), "75.00");
  assert.equal(suggestedSuccessorCycleAmount("100.00", 6, 3).toFixed(2), "50.00");
  assert.equal(suggestedSuccessorCycleAmount("25.00", 1, 3).toFixed(2), "75.00");
  assert.equal(suggestedSuccessorCycleAmount("10.00", 6, 3).toFixed(2), "5.00");
});

test("leaving a 6-month term defaults to quarterly", () => {
  assert.equal(defaultTermRetargetInterval(6), 3);
  assert.equal(defaultTermRetargetInterval(12), 6);
  assert.equal(defaultTermRetargetInterval(3), 1);
});

test("a generated interval name replaces a cadence-named agreement", () => {
  assert.equal(destinationAgreementName("Every 6 months GPS tracking", 3), "Quarterly GPS tracking");
  assert.equal(destinationAgreementName("Fleet GPS", 3), "Fleet GPS");
});

test("the overdue 6-month recurring case can move to 3 months and void the invoice", () => {
  assert.deepEqual(termRetargetBlockers(overdueSixMonth(), 3), []);
  const plan = planTermRetarget(overdueSixMonth(), {
    targetIntervalMonths: 3,
    firstChargeDate: "2026-11-27",
    invoiceDisposition: "void",
    serviceAmounts: [{ itemId: "item-1", agreedAmountPerCycle: "75.00" }],
    today: d("2026-11-27"),
  });
  assert.equal(plan.sourceId, "sub-6");
  assert.equal(plan.targetIntervalMonths, 3);
  assert.equal(plan.sourceIntervalMonths, 6);
  assert.equal(plan.destinationName, "Quarterly GPS tracking");
  assert.equal(plan.cycleTotal, "75.00");
  assert.equal(plan.invoiceDisposition, "void");
  assert.deepEqual(plan.voidInvoiceIds, ["inv-1"]);
  assert.equal(plan.services[0].agreedAmountPerCycle, "75.00");
  assert.equal(plan.transferDate, "2026-11-27");
});

test("staff can leave the overdue invoice collectable on the old agreement", () => {
  const plan = planTermRetarget(overdueSixMonth(), {
    targetIntervalMonths: 3,
    firstChargeDate: "2026-11-27",
    invoiceDisposition: "leave",
    serviceAmounts: [],
    today: d("2026-11-27"),
  });
  assert.equal(plan.invoiceDisposition, "leave");
  assert.deepEqual(plan.voidInvoiceIds, []);
  assert.equal(plan.cycleTotal, "75.00");
});

test("an open overdue invoice requires an explicit void-or-leave choice", () => {
  assert.throws(
    () => planTermRetarget(overdueSixMonth(), {
      targetIntervalMonths: 3,
      firstChargeDate: "2026-11-27",
      invoiceDisposition: null,
      serviceAmounts: [],
      today: d("2026-11-27"),
    }),
    (error) => error instanceof CanonicalSubscriptionValidationError && error.code === "INVOICE_DISPOSITION_REQUIRED",
  );
});

test("a partially paid invoice cannot be voided as part of the term change", () => {
  assert.throws(
    () => planTermRetarget(overdueSixMonth({
      openInvoices: [{ id: "inv-p", number: "INV-9", amountDue: "40.00", currency: "XCD", status: "partially_paid" }],
    }), {
      targetIntervalMonths: 3,
      firstChargeDate: "2026-11-27",
      invoiceDisposition: "void",
      serviceAmounts: [],
      today: d("2026-11-27"),
    }),
    (error) => error instanceof CanonicalSubscriptionValidationError && error.code === "PARTIAL_INVOICE_CANNOT_VOID",
  );
});

test("the same cadence, card billing, and missing email are refused", () => {
  assert.match(termRetargetBlockers(overdueSixMonth(), 6).join(" "), /already every 6 months/i);
  assert.match(termRetargetBlockers(overdueSixMonth({ collectionMethod: "stripe_autocharge" })).join(" "), /recurring-invoice/);
  assert.match(termRetargetBlockers(overdueSixMonth({ customerEmail: null })).join(" "), /billing email/);
  assert.match(termRetargetBlockers(overdueSixMonth({ stripeBillingEnabled: false })).join(" "), /not enabled/);
  assert.match(termRetargetBlockers(overdueSixMonth({ hasOpenStripeLink: true })).join(" "), /card on file/);
  assert.match(termRetargetBlockers(overdueSixMonth({ lifecycleStatus: "ended" })).join(" "), /pending or active/);
  assert.match(termRetargetBlockers(overdueSixMonth({ hasMigrationLedger: true })).join(" "), /migration record/);
  assert.match(termRetargetBlockers(overdueSixMonth({
    liveServices: [{ id: "p", label: "Paused", status: "paused", currentAmount: "150.00", currentIntervalMonths: 6 }],
  })).join(" "), /paused/);
});

test("pay-now cannot be scheduled for a future first charge", () => {
  assert.throws(
    () => planTermRetarget(overdueSixMonth({ openInvoices: [] }), {
      targetIntervalMonths: 3,
      firstChargeDate: "2026-12-01",
      invoiceDisposition: null,
      serviceAmounts: [],
      today: d("2026-11-27"),
    }),
    (error) => error instanceof CanonicalSubscriptionValidationError && error.code === "FUTURE_CHARGE_DATE",
  );
});

test("collection offers the term-change flow and the action sends pay-now on the new agreement", async () => {
  const [collection, billing, actions, notices, service] = await Promise.all([
    read("components/admin/canonical-subscription/collection-tab.tsx"),
    read("components/admin/canonical-subscription/billing-tab.tsx"),
    read("app/admin/subscriptions/canonical/actions.ts"),
    read("components/admin/canonical-subscription/subscription-notices.tsx"),
    read("lib/services/canonical-term-retarget-service.ts"),
  ]);
  assert.match(collection, /TermRetargetPayNowPanel/);
  assert.match(collection, /Change term and pay by card/);
  assert.match(billing, /change term on Collection/);
  assert.match(notices, /renew at a different term/);
  assert.match(actions, /retargetTermAndPayNowAction/);
  assert.match(actions, /retargetTermAndCollectByCard/);
  assert.match(service, /retargetCanonicalSubscriptionTerm/);
  assert.match(service, /sendStaffPayNowCheckout/);
  assert.match(service, /confirmVoidOpenInvoices: false/);
});
