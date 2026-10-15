import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCanonicalSubscriptionUiActionAllowed,
  buildCanonicalSubscriptionAdminRow,
  canonicalSubscriptionUiAccess,
  canonicalSubscriptionUiEnabled,
  CanonicalSubscriptionUiError,
  normalizedMonthlyAmount,
  type CanonicalSubscriptionAdminRowInput,
} from "../lib/domain/canonical-subscription-admin";

function row(overrides: Partial<CanonicalSubscriptionAdminRowInput> = {}) {
  return buildCanonicalSubscriptionAdminRow({
    id: "sub-1",
    customerId: "customer-1",
    customer: "Sanitized customer",
    name: "Fleet A",
    reference: "REF-A",
    collectionMethod: "manual_invoice",
    lifecycleStatus: "draft",
    controlMode: "shadow",
    hasMigrationLedger: false,
    billingIntervalMonths: 1,
    currency: "XCD",
    itemCount: 3,
    recurringCycleTotal: "70.00",
    nextBillingDate: new Date("2026-11-01T00:00:00.000Z"),
    collectionHealth: "not_started",
    attentionRequired: false,
    ...overrides,
  });
}

test("multiple subscriptions for one customer remain independent overview rows", () => {
  const rows = [row(), row({ id: "sub-2", name: "Fleet B", reference: "REF-B" })];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].customerId, rows[1].customerId);
  assert.notEqual(rows[0].id, rows[1].id);
});

test("monthly cycle total and normalized MRR are displayed separately", () => {
  const monthly = row({ recurringCycleTotal: "70.00", billingIntervalMonths: 1 });
  assert.equal(monthly.recurringCycleTotal, "70.00");
  assert.equal(monthly.normalizedMrr, "70.00");
});

test("explicit annual amount is normalized without replacing its cycle total", () => {
  const annual = row({ recurringCycleTotal: "275.00", billingIntervalMonths: 12 });
  assert.equal(annual.recurringCycleTotal, "275.00");
  assert.equal(annual.normalizedMrr, "22.92");
  assert.equal(normalizedMonthlyAmount("275.00", 12), "22.92");
});

test("only unmigrated shadow drafts are editable", () => {
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "shadow", lifecycleStatus: "draft", hasMigrationLedger: false }), "editable_draft");
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "shadow", lifecycleStatus: "draft", hasMigrationLedger: true }), "migrated_shadow_read_only");
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "shadow", lifecycleStatus: "active", hasMigrationLedger: false }), "shadow_read_only");
});

test("legacy and canonical arrangements are read-only", () => {
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "legacy", lifecycleStatus: null, hasMigrationLedger: false }), "legacy_read_only");
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "canonical", lifecycleStatus: "active", hasMigrationLedger: false }), "canonical_read_only");
});

test("unauthenticated draft action is rejected", () => {
  assert.throws(
    () => assertCanonicalSubscriptionUiActionAllowed({
      authenticated: false,
      access: "editable_draft",
      environment: { NODE_ENV: "test", CANONICAL_SUBSCRIPTION_UI_ENABLED: "true" },
    }),
    (error) => error instanceof CanonicalSubscriptionUiError && error.code === "UNAUTHORIZED",
  );
});

test("migrated shadow and legacy actions are rejected server-side", () => {
  for (const access of ["migrated_shadow_read_only", "legacy_read_only"] as const) {
    assert.throws(
      () => assertCanonicalSubscriptionUiActionAllowed({
        authenticated: true,
        access,
        environment: { NODE_ENV: "test", CANONICAL_SUBSCRIPTION_UI_ENABLED: "true" },
      }),
      (error) => error instanceof CanonicalSubscriptionUiError && error.code === "SUBSCRIPTION_READ_ONLY",
    );
  }
});

test("production remains disabled even when the UI flag is set", () => {
  assert.equal(canonicalSubscriptionUiEnabled({ NODE_ENV: "production", CANONICAL_SUBSCRIPTION_UI_ENABLED: "true" }), false);
  assert.equal(canonicalSubscriptionUiEnabled({ NODE_ENV: "test", CANONICAL_SUBSCRIPTION_UI_ENABLED: "true" }), true);
  assert.equal(canonicalSubscriptionUiEnabled({ NODE_ENV: "test" }), false);
});

test("legacy MRR can use stored monthly evidence without inventing a cycle total", () => {
  const legacy = row({
    controlMode: "legacy",
    lifecycleStatus: "active",
    recurringCycleTotal: null,
    legacyMonthlyRate: "25.00",
    legacyQuantity: 3,
  });
  assert.equal(legacy.recurringCycleTotal, null);
  assert.equal(legacy.normalizedMrr, "75.00");
});

test("UI routes include detail, empty, loading, error and price-history states", async () => {
  const [overview, detail, loading, error] = await Promise.all([
    readFile("app/admin/subscriptions/canonical/page.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/[subscriptionId]/page.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/loading.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/error.tsx", "utf8"),
  ]);
  assert.match(overview, /No subscriptions in this view/);
  assert.match(detail, /Billing summary/);
  assert.match(detail, /Price history/);
  assert.match(detail, /Hardware assignment history/);
  assert.match(loading, /aria-busy/);
  assert.match(error, /No billing action was performed/);
});

test("draft actions delegate only to canonical draft services", async () => {
  const actions = await readFile("app/admin/subscriptions/canonical/actions.ts", "utf8");
  assert.match(actions, /createDraftCanonicalSubscription/);
  assert.match(actions, /addBillableServiceToSubscription/);
  assert.match(actions, /scheduleSubscriptionItemRate/);
  assert.doesNotMatch(actions, /startStripeCheckout|createRecurringSchedule|generateRecurringInvoice|stripe\.checkout/);
});

test("detail presents negotiated classifications and server-backed annual preview", async () => {
  const detail = await readFile("app/admin/subscriptions/canonical/[subscriptionId]/page.tsx", "utf8");
  assert.match(detail, /latestRate\.classification/);
  assert.match(detail, /previewAnnualSubscriptionAddition/);
  assert.match(detail, /not an adjustment invoice or payment obligation/);
});
