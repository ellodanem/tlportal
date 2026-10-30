import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCanonicalSubscriptionAdminRow,
  type CanonicalSubscriptionAdminRow,
  type CanonicalSubscriptionAdminRowInput,
} from "../lib/domain/canonical-subscription-admin";
import {
  buildSubscriptionWorkspace,
  computeWorkspaceMetrics,
  customerGroupView,
  MULTIPLE_SCHEDULES_LABEL,
  parseWorkspaceSearchParams,
  subscriptionNeedsAttention,
  type WorkspaceQuery,
} from "../lib/domain/canonical-subscription-workspace";

const money = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;
const formatters = { money };

let sequence = 0;
function sub(overrides: Partial<CanonicalSubscriptionAdminRowInput> = {}): CanonicalSubscriptionAdminRow {
  sequence += 1;
  return buildCanonicalSubscriptionAdminRow({
    id: `sub-${sequence}`,
    customerId: "customer-1",
    customer: "Sanitized Customer",
    name: "Monthly GPS Tracking",
    reference: null,
    collectionMethod: "manual_invoice",
    lifecycleStatus: "active",
    controlMode: "canonical",
    hasMigrationLedger: false,
    billingIntervalMonths: 1,
    currency: "XCD",
    itemCount: 1,
    recurringCycleTotal: "30.00",
    nextBillingDate: new Date("2026-11-09T00:00:00.000Z"),
    collectionHealth: "current",
    attentionRequired: false,
    ...overrides,
  });
}

/** Plastic Solutions reference scenario: two annual services sharing one renewal, one monthly service. */
function plasticSolutions() {
  return [
    sub({
      id: "plastic-annual", customerId: "plastic", customer: "Plastic Solutions Ltd", name: "Annual GPS Tracking",
      billingIntervalMonths: 12, itemCount: 2, recurringCycleTotal: "660.00",
      nextBillingDate: new Date("2027-02-13T00:00:00.000Z"),
    }),
    sub({
      id: "plastic-monthly", customerId: "plastic", customer: "Plastic Solutions Ltd", name: "Monthly GPS Tracking",
      billingIntervalMonths: 1, itemCount: 1, recurringCycleTotal: "30.00",
      nextBillingDate: new Date("2026-11-09T00:00:00.000Z"),
    }),
  ];
}

function workspace(rows: CanonicalSubscriptionAdminRow[], query: WorkspaceQuery = {}) {
  return buildSubscriptionWorkspace(rows, query);
}

test("a customer with one subscription is a single row that opens Subscription Details directly", () => {
  const only = sub({ id: "venture", customerId: "venture", customer: "Venture ATV", name: "GPS Tracking", recurringCycleTotal: "50.00" });
  const result = workspace([only]);
  assert.equal(result.groups.length, 1);
  const view = customerGroupView(result.groups[0], formatters);
  assert.equal(view.kind, "single");
  assert.equal(view.subscriptions[0].href, "/admin/subscriptions/canonical/venture");
  assert.equal(view.recurring, "XCD 50.00");
  assert.equal(view.recurringPeriod, "/ month");
  assert.equal(view.servicesLabel, "1 service");
  assert.equal(view.status.label, "Active");
});

test("Plastic Solutions appears once with independent annual and monthly subscriptions", () => {
  const result = workspace([...plasticSolutions(), sub({ customerId: "other", customer: "Other Co" })]);
  const plastic = result.groups.filter((group) => group.customer === "Plastic Solutions Ltd");
  assert.equal(plastic.length, 1);
  const view = customerGroupView(plastic[0], formatters);
  assert.equal(view.kind, "group");
  assert.equal(view.context, "3 services \u00b7 2 subscriptions \u00b7 Annual + Monthly");
  // Mixed cadences: no combined amount and no single renewal date.
  assert.equal(view.recurring, null);
  assert.equal(view.nextCycle, MULTIPLE_SCHEDULES_LABEL);
  const byId = Object.fromEntries(view.subscriptions.map((row) => [row.id, row]));
  assert.equal(byId["plastic-annual"].recurring, "XCD 660.00");
  assert.equal(byId["plastic-annual"].recurringPeriod, "/ year");
  assert.equal(byId["plastic-annual"].nextCycle, "Feb 13, 2027");
  assert.equal(byId["plastic-annual"].servicesLabel, "2 services");
  assert.equal(byId["plastic-monthly"].recurring, "XCD 30.00");
  assert.equal(byId["plastic-monthly"].nextCycle, "Nov 9, 2026");
  assert.equal(byId["plastic-annual"].href, "/admin/subscriptions/canonical/plastic-annual");
  assert.equal(byId["plastic-monthly"].href, "/admin/subscriptions/canonical/plastic-monthly");
  // Soonest cycle first inside the group.
  assert.deepEqual(view.subscriptions.map((row) => row.id), ["plastic-monthly", "plastic-annual"]);
});

test("grouping uses the canonical customer id, never the display name", () => {
  const rows = [
    sub({ customerId: "a", customer: "Same Name Ltd" }),
    sub({ customerId: "b", customer: "Same Name Ltd" }),
    sub({ customerId: "c", customer: "Renamed Co" }),
    sub({ customerId: "c", customer: "Renamed Company Limited" }),
  ];
  const result = workspace(rows);
  assert.equal(result.groups.length, 3);
  assert.equal(new Set(result.groups.map((group) => group.customerId)).size, 3);
  assert.equal(result.groups.find((group) => group.customerId === "c")?.rows.length, 2);
});

test("matching renewal dates do not merge subscriptions; same-cadence subscriptions share a date only when they truly match", () => {
  const same = [
    sub({ id: "q1", customerId: "x", customer: "X", name: "Fleet A", billingIntervalMonths: 3, nextBillingDate: new Date("2027-01-15T00:00:00.000Z") }),
    sub({ id: "q2", customerId: "x", customer: "X", name: "Fleet B", billingIntervalMonths: 3, nextBillingDate: new Date("2027-01-15T00:00:00.000Z") }),
  ];
  const sameView = customerGroupView(workspace(same).groups[0], formatters);
  assert.equal(sameView.subscriptions.length, 2);
  assert.equal(sameView.nextCycle, "Jan 15, 2027");
  assert.equal(sameView.context, "2 services \u00b7 2 subscriptions \u00b7 Quarterly");
  assert.equal(sameView.recurring, null);

  const different = [same[0], { ...same[1], nextBillingDate: new Date("2027-04-15T00:00:00.000Z") }];
  assert.equal(customerGroupView(workspace(different).groups[0], formatters).nextCycle, MULTIPLE_SCHEDULES_LABEL);
});

test("customer status is never Active while a subscription needs attention", () => {
  const rows = [
    sub({ id: "ok", customerId: "m", customer: "Mixed Co" }),
    sub({ id: "late", customerId: "m", customer: "Mixed Co", attentionRequired: true }),
  ];
  const view = customerGroupView(workspace(rows).groups[0], formatters);
  assert.equal(view.status.label, "Needs attention");
  assert.equal(view.status.tone, "alert");
  const byId = Object.fromEntries(view.subscriptions.map((row) => [row.id, row.status.label]));
  assert.deepEqual(byId, { ok: "Active", late: "Collection alert" });

  const draft = sub({ customerId: "d", customer: "Draft Co", lifecycleStatus: "draft", controlMode: "canonical" });
  assert.equal(customerGroupView(workspace([draft, sub({ customerId: "d", customer: "Draft Co" })]).groups[0], formatters).status.label, "Needs attention");
  assert.equal(customerGroupView(workspace([draft]).groups[0], formatters).status.label, "Setup required");
});

test("summary counts subscription records, active subscriptions, existing MRR and actionable attention", () => {
  const rows = [
    ...plasticSolutions(), // 2 subscriptions, 3 services, one customer
    sub({ customerId: "late", customer: "Late Co", attentionRequired: true, recurringCycleTotal: "120.00" }),
    sub({ customerId: "draft", customer: "Draft Co", lifecycleStatus: "draft" }),
    sub({ customerId: "shadow", customer: "Shadow Co", controlMode: "shadow", lifecycleStatus: "active" }),
    sub({ customerId: "paused", customer: "Paused Co", lifecycleStatus: "paused" }),
    sub({ customerId: "ended", customer: "Ended Co", lifecycleStatus: "ended" }),
    sub({ customerId: "legacy", customer: "Legacy Co", controlMode: "legacy", lifecycleStatus: "active" }),
  ];
  const metrics = computeWorkspaceMetrics(rows);
  assert.equal(metrics.totalCount, 7, "legacy rows are not canonical subscriptions; services are never counted");
  // Plastic x2 + Late Co are operational (canonical + active). Draft/shadow/paused/ended are not.
  assert.equal(metrics.activeCount, 3);
  // 660/12 + 30 + 120 = 205.00, using the existing normalised MRR on each row.
  assert.equal(metrics.operationalMrr, 205);
  assert.equal(metrics.operationalMrrCurrency, "XCD");
  const expected = rows
    .filter((row) => row.controlMode === "canonical" && row.lifecycleStatus === "active")
    .reduce((sum, row) => sum + Number(row.normalizedMrr), 0);
  assert.equal(metrics.operationalMrr, Number(expected.toFixed(2)));
  // collection alert + draft setup + shadow review; paused, ended, and plain active are not attention.
  assert.equal(metrics.needsAttentionCount, 3);
  assert.equal(rows.filter(subscriptionNeedsAttention).length, 3);
  // The summary is independent of any filter.
  assert.deepEqual(workspace(rows, { query: "plastic" }).metrics, metrics);
  // Two subscriptions for one customer still count as two.
  assert.equal(computeWorkspaceMetrics(plasticSolutions()).totalCount, 2);
});

test("MRR is withheld rather than summed across currencies", () => {
  const metrics = computeWorkspaceMetrics([sub({ currency: "XCD" }), sub({ customerId: "usd", currency: "USD" })]);
  assert.equal(metrics.operationalMrr, null);
  assert.equal(metrics.currencyCount, 2);
});

test("search matches customer, subscription name, reference and id while keeping the customer group", () => {
  const rows = [...plasticSolutions(), sub({ id: "abc-123", customerId: "nick", customer: "Nicholas Benjamin", name: "Manual Invoicing", reference: "MAN-77" })];
  const byCustomer = workspace(rows, { query: "plastic" });
  assert.equal(byCustomer.groups.length, 1);
  assert.equal(byCustomer.groups[0].rows.length, 2);

  const bySubscription = workspace(rows, { query: "annual gps" });
  assert.equal(bySubscription.groups.length, 1);
  assert.deepEqual(bySubscription.groups[0].rows.map((row) => row.id), ["plastic-annual"]);
  assert.equal(bySubscription.groups[0].totalSubscriptionCount, 2);

  assert.equal(workspace(rows, { query: "man-77" }).groups[0].customer, "Nicholas Benjamin");
  assert.equal(workspace(rows, { query: "abc-123" }).groups[0].customer, "Nicholas Benjamin");
  assert.equal(workspace(rows, { query: "no such thing" }).groups.length, 0);
  assert.equal(workspace(rows, { query: "no such thing" }).isEmpty, false);
});

test("filtering to Annual shows Plastic Solutions once with only its annual subscription", () => {
  const rows = [...plasticSolutions(), sub({ customerId: "monthly-only", customer: "Monthly Only" })];
  const result = workspace(rows, { cadence: 12 });
  assert.equal(result.groups.length, 1);
  const view = customerGroupView(result.groups[0], formatters);
  assert.equal(view.kind, "group", "still one customer with a group of its matching subscriptions");
  assert.deepEqual(view.subscriptions.map((row) => row.id), ["plastic-annual"]);
  assert.equal(view.context, "2 services \u00b7 1 of 2 subscriptions \u00b7 Annual");
  assert.equal(view.nextCycle, "Feb 13, 2027");
  assert.equal(result.subscriptionTotal, 1);
  assert.equal(workspace(rows, { cadence: 1 }).groups.length, 2);
});

test("status filters map to canonical statuses and share the summary definitions", () => {
  const rows = [
    sub({ id: "active", customerId: "1", customer: "A" }),
    sub({ id: "paused", customerId: "2", customer: "B", lifecycleStatus: "paused" }),
    sub({ id: "ended", customerId: "3", customer: "C", lifecycleStatus: "canceled" }),
    sub({ id: "alert", customerId: "4", customer: "D", attentionRequired: true }),
    sub({ id: "setup", customerId: "5", customer: "E", lifecycleStatus: "draft" }),
  ];
  const ids = (status: WorkspaceQuery["status"]) => workspace(rows, { status }).groups.flatMap((group) => group.rows.map((row) => row.id)).sort();
  assert.deepEqual(ids("all"), ["active", "alert", "ended", "paused", "setup"]);
  assert.deepEqual(ids("active"), ["active", "alert"]);
  assert.deepEqual(ids("attention"), ["alert", "setup"]);
  assert.deepEqual(ids("paused"), ["paused"]);
  assert.deepEqual(ids("history"), ["ended"]);
  const metrics = computeWorkspaceMetrics(rows);
  assert.equal(ids("active").length, metrics.activeCount);
  assert.equal(ids("attention").length, metrics.needsAttentionCount);
});

test("cadence options come from the data, including uncommon cadences", () => {
  const options = workspace([sub({ billingIntervalMonths: 4 }), sub({ billingIntervalMonths: 6 })]).cadenceOptions;
  assert.deepEqual(options.map((option) => option.value), ["1", "3", "4", "6", "12"]);
  assert.equal(options.find((option) => option.value === "4")?.label, "Every 4 months");
});

test("pagination counts customers and never splits a customer group across pages", () => {
  const rows: CanonicalSubscriptionAdminRow[] = [];
  for (let customer = 1; customer <= 7; customer += 1) {
    const count = customer % 3 === 0 ? 3 : customer % 2 === 0 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      rows.push(sub({ customerId: `c${customer}`, customer: `Customer ${customer}`, name: `Plan ${index}`, id: `c${customer}-s${index}` }));
    }
  }
  const pages = [1, 2, 3].map((page) => workspace(rows, { page, pageSize: 3 }));
  assert.equal(pages[0].pageCount, 3);
  assert.equal(pages[0].groupTotal, 7);
  const seen = pages.flatMap((result) => result.groups.map((group) => group.customerId));
  assert.equal(new Set(seen).size, 7, "no duplicate customer rows across pages");
  assert.deepEqual(seen, ["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
  for (const result of pages) {
    for (const group of result.groups) {
      assert.equal(group.rows.length, group.totalSubscriptionCount, "all of a customer's subscriptions stay together");
    }
  }
  assert.equal(workspace(rows, { page: 99, pageSize: 3 }).page, 3);
});

test("sorting orders customer groups and stays coherent with pagination", () => {
  const rows = [
    sub({ customerId: "b", customer: "bravo", nextBillingDate: new Date("2026-12-01T00:00:00.000Z"), itemCount: 5 }),
    sub({ customerId: "a", customer: "Alpha", nextBillingDate: new Date("2027-03-01T00:00:00.000Z"), itemCount: 1 }),
    sub({ customerId: "c", customer: "Charlie", nextBillingDate: null, itemCount: 9 }),
    sub({ customerId: "a", customer: "Alpha", nextBillingDate: new Date("2026-11-01T00:00:00.000Z"), itemCount: 1 }),
  ];
  const order = (query: WorkspaceQuery) => workspace(rows, query).groups.map((group) => group.customerId);
  assert.deepEqual(order({ sort: "customer" }), ["a", "b", "c"]);
  assert.deepEqual(order({ sort: "customer", direction: "desc" }), ["c", "b", "a"]);
  // A customer sorts by its earliest next cycle; unscheduled always last.
  assert.deepEqual(order({ sort: "renewal" }), ["a", "b", "c"]);
  assert.deepEqual(order({ sort: "renewal", direction: "desc" }), ["b", "a", "c"]);
  assert.deepEqual(order({ sort: "services", direction: "desc" }), ["c", "b", "a"]);
  assert.deepEqual(workspace(rows, { sort: "customer", pageSize: 1, page: 2 }).groups.map((group) => group.customerId), ["b"]);
});

test("ended subscriptions stay visible under their customer without distorting the group summary", () => {
  const rows = [
    sub({ id: "now", customerId: "h", customer: "History Co", itemCount: 2 }),
    sub({ id: "then", customerId: "h", customer: "History Co", lifecycleStatus: "ended", itemCount: 7 }),
  ];
  const view = customerGroupView(workspace(rows).groups[0], formatters);
  assert.equal(view.context, "2 services \u00b7 2 subscriptions (1 ended) \u00b7 Monthly");
  assert.equal(view.status.label, "Active");
  assert.deepEqual(view.subscriptions.map((row) => row.id), ["now", "then"]);
  assert.equal(view.subscriptions[1].status.label, "Ended");
});

test("search params normalise safely and keep older view bookmarks working", () => {
  assert.deepEqual(parseWorkspaceSearchParams({}), { query: "", status: "all", cadence: null, sort: "customer", direction: "asc", page: 1 });
  assert.equal(parseWorkspaceSearchParams({ status: "paused" }).status, "paused");
  assert.equal(parseWorkspaceSearchParams({ view: "alerts" }).status, "attention");
  assert.equal(parseWorkspaceSearchParams({ view: "setup" }).status, "attention");
  assert.equal(parseWorkspaceSearchParams({ status: "bogus" }).status, "all");
  assert.equal(parseWorkspaceSearchParams({ cadence: "12" }).cadence, 12);
  assert.equal(parseWorkspaceSearchParams({ cadence: "none" }).cadence, "none");
  assert.equal(parseWorkspaceSearchParams({ cadence: "abc" }).cadence, null);
  assert.equal(parseWorkspaceSearchParams({ sort: "nope", dir: "desc", page: "-4" }).sort, "customer");
  assert.equal(parseWorkspaceSearchParams({ page: "-4" }).page, 1);
});

test("the listing is read-only: no financial, provider, or subscription writes are reachable from it", async () => {
  const [domain, page, client] = await Promise.all([
    readFile("lib/domain/canonical-subscription-workspace.ts", "utf8"),
    readFile("app/admin/subscriptions/canonical/page.tsx", "utf8"),
    readFile("components/admin/subscriptions-workspace.tsx", "utf8"),
  ]);
  for (const source of [domain, page, client]) {
    assert.doesNotMatch(source, /from "@\/lib\/db"|prisma\.[a-zA-Z]+\.(create|update|delete|upsert)/);
    assert.doesNotMatch(source, /from "[^"]*(stripe|actions|billing-service|activation-service)[^"]*"|"use server"/i);
  }
  // Single Add subscription action; removed clutter does not return.
  assert.equal((page.match(/Add subscription/g) ?? []).length, 1);
  assert.match(page, /href="\/admin\/subscriptions\/canonical\/new"/);
  for (const removed of ["Subscription insights", "Quick links", "Next actions", "Collection mix", "Billing records and transition history"]) {
    assert.ok(!page.includes(removed), `${removed} should not be on the main page`);
  }
});
