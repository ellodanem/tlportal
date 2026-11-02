import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mergeBlockers,
  mergeCompatibilityKey,
  planSubscriptionMerge,
  suggestedMergeGroups,
  type MergeSubscriptionSnapshot,
} from "../lib/domain/canonical-subscription-merge";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** One of Blue Taxi's five single-vehicle annual subscriptions, all renewing 2027-01-27. */
function blueTaxi(id: string, overrides: Partial<MergeSubscriptionSnapshot> = {}): MergeSubscriptionSnapshot {
  return {
    id,
    name: "Annual GPS tracking",
    customerId: "blue-taxi",
    controlMode: "canonical",
    lifecycleStatus: "active",
    collectionMethod: "manual_invoice",
    billingIntervalMonths: 12,
    currency: "XCD",
    nextBillingDate: d("2027-01-27"),
    gracePeriodDays: 7,
    hasMigrationLedger: false,
    hasPilotActivation: false,
    invoiceCount: 0,
    billingInvoiceCount: 0,
    billingOperationCount: 0,
    providerLinkCount: 0,
    initialInvoiceId: null,
    items: [{ id: `${id}-item`, status: "active", invoiceSnapshotCount: 0, adjustmentInvoiceId: null }],
    schedules: [{ id: `${id}-schedule`, hasGeneratedInvoice: false, dueDaysAfterIssue: 7, autoEmail: true, emailTo: null }],
    ...overrides,
  };
}

const five = () => ["a", "b", "c", "d", "e"].map((id) => blueTaxi(id));

test("five un-invoiced single-vehicle subscriptions with identical terms merge into the first", () => {
  const [target, ...sources] = five();
  assert.deepEqual(mergeBlockers(target), []);
  const plan = planSubscriptionMerge(target, sources);
  assert.equal(plan.targetId, "a");
  assert.deepEqual(plan.sourceIds, ["b", "c", "d", "e"]);
  assert.deepEqual(plan.movedItemIds, ["b-item", "c-item", "d-item", "e-item"]);
  assert.equal(plan.movedLiveServiceCount, 4);
  // The target keeps its schedule; only the sources' schedules stop invoicing.
  assert.deepEqual(plan.endedScheduleIds, ["b-schedule", "c-schedule", "d-schedule", "e-schedule"]);
});

test("ended services move too so the sources are left empty, but are not counted as live", () => {
  const [target, source] = [blueTaxi("a"), blueTaxi("b", {
    items: [
      { id: "live", status: "active", invoiceSnapshotCount: 0, adjustmentInvoiceId: null },
      { id: "old", status: "ended", invoiceSnapshotCount: 0, adjustmentInvoiceId: null },
    ],
  })];
  const plan = planSubscriptionMerge(target, [source]);
  assert.deepEqual(plan.movedItemIds, ["live", "old"]);
  assert.equal(plan.movedLiveServiceCount, 1);
});

test("anything already billed locks the merge", () => {
  const billed: Partial<MergeSubscriptionSnapshot>[] = [
    { invoiceCount: 1 },
    { billingInvoiceCount: 1 },
    { billingOperationCount: 1 },
    { providerLinkCount: 1 },
    { initialInvoiceId: "inv" },
    { items: [{ id: "i", status: "active", invoiceSnapshotCount: 1, adjustmentInvoiceId: null }] },
    { items: [{ id: "i", status: "active", invoiceSnapshotCount: 0, adjustmentInvoiceId: "inv" }] },
    { schedules: [{ id: "s", hasGeneratedInvoice: true, dueDaysAfterIssue: 7, autoEmail: true, emailTo: null }] },
  ];
  for (const overrides of billed) {
    assert.ok(mergeBlockers(blueTaxi("x", overrides)).length > 0, JSON.stringify(overrides));
    assert.throws(() => planSubscriptionMerge(blueTaxi("a"), [blueTaxi("b", overrides)]), /cannot be merged/);
    // The target being billed is just as disqualifying.
    assert.throws(() => planSubscriptionMerge(blueTaxi("a", overrides), [blueTaxi("b")]), /cannot be merged/);
  }
});

test("only manual-invoice canonical draft/pending/active subscriptions take part", () => {
  assert.match(mergeBlockers(blueTaxi("x", { collectionMethod: "stripe_autocharge" })).join(" "), /manual-invoice/);
  assert.match(mergeBlockers(blueTaxi("x", { controlMode: "shadow" })).join(" "), /canonical/);
  assert.match(mergeBlockers(blueTaxi("x", { lifecycleStatus: "paused" })).join(" "), /draft, pending or active/);
  assert.match(mergeBlockers(blueTaxi("x", { lifecycleStatus: "ended" })).join(" "), /draft, pending or active/);
  assert.match(mergeBlockers(blueTaxi("x", { hasMigrationLedger: true })).join(" "), /migration record/);
  assert.match(mergeBlockers(blueTaxi("x", { hasPilotActivation: true })).join(" "), /migration record/);
  assert.match(mergeBlockers(blueTaxi("x", { nextBillingDate: null })).join(" "), /missing/);
  assert.match(mergeBlockers(blueTaxi("x", { schedules: [
    { id: "1", hasGeneratedInvoice: false, dueDaysAfterIssue: 7, autoEmail: true, emailTo: null },
    { id: "2", hasGeneratedInvoice: false, dueDaysAfterIssue: 7, autoEmail: true, emailTo: null },
  ] })).join(" "), /more than one/);
  assert.deepEqual(mergeBlockers(blueTaxi("x", { lifecycleStatus: "draft", schedules: [] })), []);
});

test("subscriptions with different terms are refused with the reason named", () => {
  const target = blueTaxi("a");
  const plan = (overrides: Partial<MergeSubscriptionSnapshot>) => planSubscriptionMerge(target, [blueTaxi("b", overrides)]);
  assert.throws(() => plan({ nextBillingDate: d("2027-11-02") }), /renewal date/);
  assert.throws(() => plan({ billingIntervalMonths: 6 }), /billing cycle/);
  assert.throws(() => plan({ currency: "USD" }), /currency/);
  assert.throws(() => plan({ gracePeriodDays: 14 }), /grace period/);
  assert.throws(() => plan({ lifecycleStatus: "draft", schedules: [] }), /status/);
  assert.throws(() => plan({ customerId: "someone-else" }), /within one customer/);
});

test("payment terms on the recurring schedules must match so no service silently changes terms", () => {
  assert.throws(
    () => planSubscriptionMerge(blueTaxi("a"), [blueTaxi("b", { schedules: [{ id: "s", hasGeneratedInvoice: false, dueDaysAfterIssue: 30, autoEmail: true, emailTo: null }] })]),
    /payment terms or email settings/,
  );
  assert.throws(
    () => planSubscriptionMerge(blueTaxi("a"), [blueTaxi("b", { schedules: [{ id: "s", hasGeneratedInvoice: false, dueDaysAfterIssue: 7, autoEmail: true, emailTo: "other@example.com" }] })]),
    /payment terms or email settings/,
  );
});

test("an active target must have a schedule to invoice the merged services; drafts have none", () => {
  assert.throws(() => planSubscriptionMerge(blueTaxi("a", { schedules: [] }), [blueTaxi("b")]), /no open recurring schedule/);
  const drafts = ["a", "b"].map((id) => blueTaxi(id, { lifecycleStatus: "draft", schedules: [] }));
  const plan = planSubscriptionMerge(drafts[0], [drafts[1]]);
  assert.deepEqual(plan.endedScheduleIds, []);
});

test("duplicates, self-merges and empty selections are rejected", () => {
  assert.throws(() => planSubscriptionMerge(blueTaxi("a"), []), /at least one/);
  assert.throws(() => planSubscriptionMerge(blueTaxi("a"), [blueTaxi("a")]), /itself or chosen twice/);
  assert.throws(() => planSubscriptionMerge(blueTaxi("a"), [blueTaxi("b"), blueTaxi("b")]), /itself or chosen twice/);
});

test("the compatibility key ignores the renewal's time of day and name but not the terms", () => {
  assert.equal(
    mergeCompatibilityKey(blueTaxi("a", { nextBillingDate: new Date("2027-01-27T12:00:00.000Z") })),
    mergeCompatibilityKey(blueTaxi("b", { name: "Different name" })),
  );
  assert.notEqual(mergeCompatibilityKey(blueTaxi("a")), mergeCompatibilityKey(blueTaxi("b", { currency: "usd" })));
});

test("a merge is only suggested for two or more matching manual canonical subscriptions", () => {
  const groups = suggestedMergeGroups([
    ...five(),
    blueTaxi("other-date", { nextBillingDate: d("2027-11-02") }),
    blueTaxi("card", { collectionMethod: "stripe_autocharge" }),
    blueTaxi("paused", { lifecycleStatus: "paused" }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((subscription) => subscription.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(suggestedMergeGroups([blueTaxi("a")]), []);
});

test("the action is staff-guarded, needs a reason, and is audited without touching billing providers", async () => {
  const actions = await read("app/admin/subscriptions/canonical/actions.ts");
  const start = actions.indexOf("export async function mergeCanonicalSubscriptionsAction(");
  assert.ok(start >= 0, "action must exist");
  const next = actions.indexOf("\nexport async function ", start + 1);
  const body = actions.slice(start, next === -1 ? undefined : next);
  assert.ok(body.includes("requireManageableCanonicalSubscription(targetId)"));
  assert.ok(body.includes("requireManageableCanonicalSubscription(sourceId)"), "every source is authorised too");
  assert.ok(body.includes("mergeSubscriptions("));
  assert.ok(body.includes('"subscription.subscriptions_merged"'));
  assert.match(body, /reason/);
  assert.doesNotMatch(body, /stripe\.|getStripeClient|createAnnualServiceAdjustmentInvoice|setRecurringScheduleStatus/);

  const service = await read("lib/services/canonical-subscription-merge-service.ts");
  assert.ok(service.includes("TransactionIsolationLevel.Serializable"), "the merge must be one serializable transaction");
  assert.ok(service.includes("planSubscriptionMerge("), "rules are re-checked on fresh data inside the transaction");
  assert.doesNotMatch(service, /stripe|\.invoice\.create|sendMail|whatsapp/i);
  // The merge retires sources and their schedules; it must never delete financial records.
  assert.doesNotMatch(service, /\.delete(Many)?\(/);
});

test("the customer page points at the merge screen when same-term subscriptions exist", async () => {
  const page = await read("app/admin/customers/[id]/subscriptions/page.tsx");
  assert.match(page, /suggestedMergeGroups/);
  assert.match(page, /canonical\/merge\?customerId=/);
  // A permanent entry point, so the screen is reachable even when the hint's strict grouping finds nothing.
  assert.match(page, /currentSubscriptions\.length > 1/);
  assert.match(page, /Merge subscriptions/);
  const workspace = await read("components/admin/subscriptions-workspace.tsx");
  assert.match(workspace, /canonical\/merge\?customerId=\$\{group\.key\}/);
});
