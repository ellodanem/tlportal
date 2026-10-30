import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeCustomerSubscriptions,
  type ReconciliationSubscription,
} from "../lib/domain/customer-subscription-reconciliation";
import {
  assertCanonicalAnnualAdjustmentExecutionEnabled,
  canonicalAnnualAdjustmentExecutionEnabled,
  CanonicalAnnualAdjustmentError,
} from "../lib/domain/canonical-annual-adjustment";

function subscription(overrides: Partial<ReconciliationSubscription> & { id: string }): ReconciliationSubscription {
  return {
    name: overrides.id,
    controlMode: "canonical",
    lifecycleStatus: "active",
    collectionMethod: "manual_invoice",
    billingIntervalMonths: 12,
    currency: "XCD",
    billingAnchorDate: "2026-02-13",
    nextBillingDate: "2027-02-13",
    openRecurringSchedules: 0,
    openStripeProviderLinks: 0,
    invoiceCount: 0,
    paidInvoiceCount: 0,
    hasMigrationLedger: false,
    items: [],
    ...overrides,
  };
}

function item(id: string, amount: string, months: number) {
  return {
    id,
    label: id,
    status: "active",
    billingEffectiveFrom: "2026-02-13",
    billingEffectiveUntil: null,
    serviceActivatedDate: "2026-02-13",
    currentRate: { amount, currency: "XCD", billingIntervalMonths: months, effectiveFrom: "2026-02-13", effectiveUntil: null },
    openDeviceAssignments: 1,
  };
}

test("a monthly and an annual subscription are grouped by cadence and never summed together", () => {
  const report = analyzeCustomerSubscriptions([
    subscription({ id: "annual", items: [item("a1", "330.00", 12), item("a2", "330.00", 12)] }),
    subscription({ id: "monthly", billingIntervalMonths: 1, collectionMethod: "stripe_autocharge", nextBillingDate: "2026-11-09", items: [item("m1", "30.00", 1)] }),
  ]);
  assert.equal(report.cadenceGroups.length, 2);
  const annual = report.cadenceGroups.find((group) => group.billingIntervalMonths === 12)!;
  const monthly = report.cadenceGroups.find((group) => group.billingIntervalMonths === 1)!;
  assert.deepEqual(annual.cycleTotals, { XCD: "660.00" });
  assert.deepEqual(monthly.cycleTotals, { XCD: "30.00" });
  assert.equal(report.consolidationCandidates.length, 0);
});

test("matching renewal dates alone never produce an unblocked merge recommendation", () => {
  const report = analyzeCustomerSubscriptions([
    subscription({ id: "one", openRecurringSchedules: 1, paidInvoiceCount: 2 }),
    subscription({ id: "two" }),
  ]);
  assert.equal(report.consolidationCandidates.length, 1);
  assert.ok(report.consolidationCandidates[0].blockers.length >= 2);
  assert.match(report.consolidationCandidates[0].reason, /do not authorise a merge/);
});

test("different cadences or collection methods are never consolidation candidates", () => {
  const report = analyzeCustomerSubscriptions([
    subscription({ id: "annual" }),
    subscription({ id: "monthly", billingIntervalMonths: 1 }),
    subscription({ id: "card", collectionMethod: "stripe_autocharge" }),
  ]);
  const pairs = report.consolidationCandidates.map((candidate) => candidate.subscriptionIds.join("+"));
  assert.deepEqual(pairs, []);
});

test("shadow records are blocked from consolidation", () => {
  const report = analyzeCustomerSubscriptions([
    subscription({ id: "shadow", controlMode: "shadow" }),
    subscription({ id: "canonical" }),
  ]);
  assert.ok(report.consolidationCandidates[0].blockers.some((blocker) => /shadow/i.test(blocker)));
});

test("production adjustment invoicing needs the owner-controlled operations flag", () => {
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({ NODE_ENV: "production", CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true" }), false);
  assert.throws(
    () => assertCanonicalAnnualAdjustmentExecutionEnabled({ NODE_ENV: "production", CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true" }),
    (error: unknown) => error instanceof CanonicalAnnualAdjustmentError && error.code === "PRODUCTION_EXECUTION_DISABLED",
  );
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({ NODE_ENV: "production", CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED: "true" }), true);
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({ NODE_ENV: "development" }), false);
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({ NODE_ENV: "development", CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true" }), true);
});

test("the subscription migration is additive and contains no destructive statements", () => {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261030120000_subscription_service_adjustments/migration.sql"), "utf8");
  const executable = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(executable, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  assert.doesNotMatch(executable, /\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+"?\w+"?\s+SET)\b/i);
  assert.doesNotMatch(executable, /\bALTER\s+TABLE\s+"?\w+"?\s+(DROP|ALTER\s+COLUMN)\b/i);
  assert.match(executable, /CREATE TABLE "SubscriptionItemInitialAdjustment"/);
});

test("subscription service flows never create invoices, contact Stripe, or notify customers", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  for (const path of [
    "lib/services/subscription-service-addition-service.ts",
    "components/admin/subscription-add-service-flow.tsx",
    "components/admin/canonical-customer-onboarding-form.tsx",
  ]) {
    const text = source(path);
    assert.doesNotMatch(text, /stripe\.(subscriptions|invoices|customers|checkout)/i, path);
    assert.doesNotMatch(text, /sendEmail|sendWhatsApp|twilio|resend/i, path);
    assert.doesNotMatch(text, /invoice\.create\(/, path);
  }
  assert.match(source("components/admin/canonical-customer-onboarding-form.tsx"), /Create draft/);
  assert.match(source("lib/services/subscription-service-addition-service.ts"), /FOR UPDATE/);
  assert.match(source("lib/services/subscription-service-addition-service.ts"), /creationKey/);
});

test("agreed-charge invoices are created as drafts so staff can customize before finalizing", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const actions = source("app/admin/subscriptions/canonical/actions.ts");
  assert.match(actions, /finalize: false/);
  assert.match(actions, /next: invoiceId \? `\/admin\/tl-invoices\/\$\{invoiceId\}`/);
  const service = source("lib/services/canonical-annual-adjustment-service.ts");
  assert.match(service, /if \(input\.finalize !== false\) await finalizeInvoiceInTransaction/);
  const form = source("components/admin/subscription-adjustment-invoice-form.tsx");
  assert.match(form, /Create draft invoice/);
  assert.doesNotMatch(form, /finalizeInvoice|finalizeAndSend/);
  const migration = source("prisma/migrations/20261030140000_adjustment_invoice_set_null/migration.sql");
  const executable = migration.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(executable, /\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+"?\w+"?\s+SET|DROP\s+(TABLE|COLUMN))\b/i);
});
