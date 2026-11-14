import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  billingDateCorrectionBlockers,
  planBillingDateCorrection,
  type BillingDateCorrectionSnapshot,
} from "../lib/domain/canonical-billing-date-correction";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** A 6-month manual subscription entered with June 23 instead of May 23 (the real case). */
function wrongSubscription(overrides: Partial<BillingDateCorrectionSnapshot> = {}): BillingDateCorrectionSnapshot {
  return {
    controlMode: "canonical",
    lifecycleStatus: "active",
    collectionMethod: "manual_invoice",
    billingIntervalMonths: 6,
    commercialStartDate: d("2026-06-23"),
    billingAnchorDate: d("2026-06-23"),
    nextBillingDate: d("2026-12-23"),
    invoiceCount: 0,
    billingInvoiceCount: 0,
    billingOperationCount: 0,
    providerLinkCount: 0,
    initialInvoiceId: null,
    items: [
      { id: "vitz", label: "Toyota Vitz", serviceActivatedDate: d("2026-06-23"), billingEffectiveFrom: d("2026-06-23"), hasInitialAdjustment: false, invoiceSnapshotCount: 0 },
      { id: "aqua", label: "PQ6484", serviceActivatedDate: d("2026-06-23"), billingEffectiveFrom: d("2026-11-23"), hasInitialAdjustment: false, invoiceSnapshotCount: 0 },
    ],
    schedules: [{ id: "schedule", hasGeneratedInvoice: false }],
    ...overrides,
  };
}

const fix = { commercialStartDate: "2026-05-23", nextBillingDate: "2026-11-23" };

test("an un-invoiced subscription can be corrected and every copied date moves together", () => {
  assert.deepEqual(billingDateCorrectionBlockers(wrongSubscription()), []);
  const plan = planBillingDateCorrection(wrongSubscription(), fix);

  assert.deepEqual(plan.previous, { commercialStartDate: "2026-06-23", billingAnchorDate: "2026-06-23", nextBillingDate: "2026-12-23" });
  assert.deepEqual(plan.next, { commercialStartDate: "2026-05-23", billingAnchorDate: "2026-05-23", nextBillingDate: "2026-11-23" });
  // A service that billed from the old start moves with it; one that already joined at the
  // renewal keeps that (now correct) date and only has its activation date fixed.
  assert.deepEqual(plan.items, [
    { id: "vitz", serviceActivatedDate: "2026-05-23", billingEffectiveFrom: "2026-05-23" },
    { id: "aqua", serviceActivatedDate: "2026-05-23", billingEffectiveFrom: null },
  ]);
});

test("a service whose billing joined at the old renewal follows the new renewal", () => {
  const snapshot = wrongSubscription({
    items: [{ id: "late", label: null, serviceActivatedDate: d("2026-06-23"), billingEffectiveFrom: d("2026-12-23"), hasInitialAdjustment: false, invoiceSnapshotCount: 0 }],
  });
  assert.deepEqual(planBillingDateCorrection(snapshot, fix).items, [{ id: "late", serviceActivatedDate: "2026-05-23", billingEffectiveFrom: "2026-11-23" }]);
});

test("deliberately different service dates are left alone", () => {
  const snapshot = wrongSubscription({
    items: [{ id: "x", label: "X", serviceActivatedDate: d("2026-07-10"), billingEffectiveFrom: d("2026-08-01"), hasInitialAdjustment: false, invoiceSnapshotCount: 0 }],
  });
  assert.deepEqual(planBillingDateCorrection(snapshot, fix).items, [{ id: "x", serviceActivatedDate: null, billingEffectiveFrom: null }]);
});

test("a deliberately different billing anchor stays put and must remain in range", () => {
  const snapshot = wrongSubscription({ billingAnchorDate: d("2026-09-01") });
  assert.equal(planBillingDateCorrection(snapshot, fix).next.billingAnchorDate, "2026-09-01");
  assert.throws(() => planBillingDateCorrection(wrongSubscription({ billingAnchorDate: d("2027-01-15") }), fix), /anchor/i);
});

test("anything already billed from the old dates locks them", () => {
  const cases: [Partial<BillingDateCorrectionSnapshot>, RegExp][] = [
    [{ invoiceCount: 1 }, /invoice/i],
    [{ billingInvoiceCount: 1 }, /invoice/i],
    [{ initialInvoiceId: "inv" }, /invoice/i],
    [{ billingOperationCount: 1 }, /operations/i],
    [{ providerLinkCount: 1 }, /provider/i],
    [{ collectionMethod: "stripe_autocharge" }, /manual-invoice/i],
    [{ controlMode: "legacy" }, /canonical/i],
    [{ lifecycleStatus: "ended" }, /ended or been canceled/i],
    [{ schedules: [{ id: "s", hasGeneratedInvoice: true }] }, /generated/i],
    [{ items: [{ id: "a", label: "A", serviceActivatedDate: d("2026-06-23"), billingEffectiveFrom: d("2026-06-23"), hasInitialAdjustment: true, invoiceSnapshotCount: 0 }] }, /partial-period/i],
    [{ items: [{ id: "a", label: "A", serviceActivatedDate: d("2026-06-23"), billingEffectiveFrom: d("2026-06-23"), hasInitialAdjustment: false, invoiceSnapshotCount: 1 }] }, /invoice/i],
  ];
  for (const [override, message] of cases) {
    const snapshot = wrongSubscription(override);
    assert.ok(billingDateCorrectionBlockers(snapshot).length > 0, JSON.stringify(override));
    assert.throws(() => planBillingDateCorrection(snapshot, fix), message, JSON.stringify(override));
  }
});

test("impossible or unchanged dates are rejected with a readable reason", () => {
  const plan = (start: string, next: string) => planBillingDateCorrection(wrongSubscription(), { commercialStartDate: start, nextBillingDate: next });
  assert.throws(() => plan("2026-06-23", "2026-12-23"), /already the saved dates/);
  assert.throws(() => plan("2026-05-23", "2026-05-23"), /after the start date/);
  assert.throws(() => plan("2026-05-23", "2026-05-01"), /after the start date/);
  assert.throws(() => plan("2025-10-23", "2026-11-23"), /two billing intervals/);
  assert.throws(() => plan("not-a-date", "2026-11-23"), /YYYY-MM-DD/);
  assert.throws(() => plan("2026-02-30", "2026-11-23"), /valid calendar date/);
  // The renewal may be less than a full interval after the start (aligned renewals).
  assert.equal(plan("2026-08-01", "2026-11-23").next.nextBillingDate, "2026-11-23");
  // Extra unpaid months (up to two intervals) are allowed so several services can share a renewal.
  assert.equal(plan("2026-01-23", "2026-11-23").next.nextBillingDate, "2026-11-23");
});

test("an annual first period may run past the anniversary so several services share one renewal", () => {
  const annual = wrongSubscription({
    billingIntervalMonths: 12,
    commercialStartDate: d("2026-02-21"),
    billingAnchorDate: d("2026-02-21"),
    nextBillingDate: d("2027-02-21"),
    items: [{ id: "aqua", label: "HU5852", serviceActivatedDate: d("2026-02-21"), billingEffectiveFrom: d("2026-02-21"), hasInitialAdjustment: false, invoiceSnapshotCount: 0 }],
  });
  const aligned = planBillingDateCorrection(annual, { commercialStartDate: "2026-02-21", nextBillingDate: "2027-04-24" });
  assert.equal(aligned.next.commercialStartDate, "2026-02-21");
  assert.equal(aligned.next.nextBillingDate, "2027-04-24");
});

test("the action is staff-guarded, needs a reason, and is audited without touching billing providers", async () => {
  const actions = await read("app/admin/subscriptions/canonical/actions.ts");
  const start = actions.indexOf("export async function correctCanonicalBillingDatesAction(");
  assert.ok(start >= 0, "action must exist");
  const body = actions.slice(start, actions.indexOf("\nexport async function ", start + 1) === -1 ? undefined : actions.indexOf("\nexport async function ", start + 1));
  assert.ok(body.includes("requireManageableCanonicalSubscription("));
  assert.ok(body.includes("correctSubscriptionBillingDates("));
  assert.ok(body.includes('"subscription.billing_dates_corrected"'));
  assert.match(body, /reason/);
  assert.doesNotMatch(body, /stripe\.|getStripeClient|createAnnualServiceAdjustmentInvoice|setRecurringScheduleStatus/);

  const service = await read("lib/services/canonical-billing-date-correction-service.ts");
  assert.ok(service.includes("TransactionIsolationLevel.Serializable"), "the correction must be one serializable transaction");
  assert.ok(service.includes("planBillingDateCorrection("), "rules are re-checked on fresh data inside the transaction");
  assert.doesNotMatch(service, /stripe|\.invoice\.create|sendMail|whatsapp/i);

  const form = await read("components/admin/canonical-billing-dates-form.tsx");
  assert.match(form, /Extra unpaid months are allowed/);
  assert.doesNotMatch(form, /Must fall within/);
});
