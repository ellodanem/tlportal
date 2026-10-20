import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCanonicalSubscriptionUiActionAllowed,
  assertCanonicalSubscriptionManagementAllowed,
  assertCanonicalSubscriptionOnboardingAllowed,
  buildCanonicalSubscriptionAdminRow,
  canonicalProviderStatusLabel,
  canonicalSubscriptionDisplayName,
  canonicalSubscriptionUiAccess,
  canonicalSubscriptionUiEnabled,
  canonicalSubscriptionUiVisible,
  CanonicalSubscriptionUiError,
  deriveCanonicalProviderStatus,
  filterCanonicalSubscriptionAdminRows,
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
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "canonical", lifecycleStatus: "draft", hasMigrationLedger: false }), "editable_draft");
});

test("active canonical arrangements have staff operational access while legacy stays read-only", () => {
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "legacy", lifecycleStatus: null, hasMigrationLedger: false }), "legacy_read_only");
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "canonical", lifecycleStatus: "active", hasMigrationLedger: false }), "canonical_operational");
  assert.equal(canonicalSubscriptionUiAccess({ controlMode: "canonical", lifecycleStatus: "active", hasMigrationLedger: true }), "canonical_operational");
});

test("internal migration names are replaced with customer-facing subscription names", () => {
  assert.equal(canonicalSubscriptionDisplayName("Canonical migration stripe subscription 1-month", 1), "Monthly GPS tracking");
  assert.equal(canonicalSubscriptionDisplayName("Tour fleet", 3), "Tour fleet");
});

test("canonical operational administration permits only normal canonical agreements", () => {
  const production = { NODE_ENV: "production", VERCEL_ENV: "production", CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE: "true" } as const;
  assert.doesNotThrow(() => assertCanonicalSubscriptionManagementAllowed({
    authenticated: true,
    access: "canonical_operational",
    controlMode: "canonical",
    environment: production,
  }));
  assert.throws(() => assertCanonicalSubscriptionManagementAllowed({
    authenticated: true,
    access: "migrated_shadow_read_only",
    controlMode: "shadow",
    environment: production,
  }), (error) => error instanceof CanonicalSubscriptionUiError && error.code === "SUBSCRIPTION_READ_ONLY");
  assert.throws(() => assertCanonicalSubscriptionManagementAllowed({
    authenticated: true,
    access: "canonical_operational",
    controlMode: "canonical",
    environment: { NODE_ENV: "production" },
  }), (error) => error instanceof CanonicalSubscriptionUiError && error.code === "PRODUCTION_UI_DISABLED");
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

test("production read-only visibility requires its separate explicit flag", () => {
  assert.equal(canonicalSubscriptionUiVisible({ NODE_ENV: "production" }), false);
  assert.equal(canonicalSubscriptionUiVisible({ NODE_ENV: "production", CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE: "true", VERCEL_ENV: "production" }), true);
  assert.equal(canonicalSubscriptionUiVisible({ NODE_ENV: "production", CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE: "true", VERCEL_ENV: "preview" }), false);
  assert.equal(canonicalSubscriptionUiEnabled({ NODE_ENV: "production", CANONICAL_SUBSCRIPTION_UI_ENABLED: "true", CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE: "true" }), false);
});

test("production onboarding permits only new canonical drafts when administration is visible", () => {
  const environment = { NODE_ENV: "production", VERCEL_ENV: "production", CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE: "true" } as const;
  assert.doesNotThrow(() => assertCanonicalSubscriptionOnboardingAllowed({
    authenticated: true,
    access: "editable_draft",
    controlMode: "canonical",
    environment,
  }));
  assert.throws(() => assertCanonicalSubscriptionOnboardingAllowed({
    authenticated: true,
    access: "editable_draft",
    controlMode: "shadow",
    environment,
  }), (error) => error instanceof CanonicalSubscriptionUiError && error.code === "SHADOW_WRITE_DISABLED");
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

test("provider status distinguishes local links from unavailable live observations", () => {
  assert.equal(deriveCanonicalProviderStatus({ controlMode: "canonical", collectionMethod: "manual_invoice", providerLinks: [] }), "not_applicable");
  assert.equal(deriveCanonicalProviderStatus({ controlMode: "canonical", collectionMethod: "stripe_autocharge", providerLinks: [] }), "not_connected");
  assert.equal(deriveCanonicalProviderStatus({ controlMode: "canonical", collectionMethod: "stripe_autocharge", providerLinks: [{ provider: "stripe", endedAt: null }] }), "linked_observation_unavailable");
  assert.equal(deriveCanonicalProviderStatus({ controlMode: "canonical", collectionMethod: "stripe_autocharge", providerLinks: [{ provider: "stripe", endedAt: null, lastError: "sync failed" }] }), "attention");
  assert.equal(canonicalProviderStatusLabel("linked_observation_unavailable"), "Linked · observation unavailable");
});

test("overview filters preserve one row per subscription and combine operational filters", () => {
  const monthly = row({ id: "sub-monthly", collectionMethod: "manual_invoice", lifecycleStatus: "active", controlMode: "canonical", providerStatus: "not_applicable" });
  const stripe = row({ id: "sub-stripe", collectionMethod: "stripe_autocharge", lifecycleStatus: "paused", controlMode: "shadow", providerStatus: "attention" });
  assert.deepEqual(filterCanonicalSubscriptionAdminRows([monthly, stripe], { collectionMethod: "stripe_autocharge", providerStatus: "attention" }).map((entry) => entry.id), ["sub-stripe"]);
  assert.deepEqual(filterCanonicalSubscriptionAdminRows([monthly, stripe], { query: "Fleet A", controlMode: "canonical" }).map((entry) => entry.id), ["sub-monthly"]);
});

test("current and history views distinguish terminated arrangements without combining them", () => {
  const current = row({ id: "sub-current", lifecycleStatus: "active", controlMode: "legacy" });
  const historical = row({ id: "sub-history", lifecycleStatus: "canceled", controlMode: "legacy" });
  assert.equal(current.historical, false);
  assert.equal(historical.historical, true);
  assert.deepEqual(filterCanonicalSubscriptionAdminRows([current, historical], { view: "current" }).map((entry) => entry.id), ["sub-current"]);
  assert.deepEqual(filterCanonicalSubscriptionAdminRows([current, historical], { view: "history" }).map((entry) => entry.id), ["sub-history"]);
  assert.deepEqual(filterCanonicalSubscriptionAdminRows([current, historical], { view: "all" }).map((entry) => entry.id), ["sub-current", "sub-history"]);
});

test("UI routes include detail, empty, loading, error and price-history states", async () => {
  const [overview, detail, demo, loading, error, preflight] = await Promise.all([
    readFile("app/admin/subscriptions/canonical/page.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/[subscriptionId]/page.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/demo/page.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/loading.tsx", "utf8"),
    readFile("app/admin/subscriptions/canonical/error.tsx", "utf8"),
    readFile("docs/production-preview-preflight.md", "utf8"),
  ]);
  assert.match(overview, /No subscriptions in this view/);
  assert.match(detail, /Billing summary/);
  assert.match(detail, /Price history/);
  assert.match(detail, /Hardware assignment history/);
  assert.match(loading, /aria-busy/);
  assert.match(error, /No billing action was performed/);
  assert.match(overview, /Billing records and transition history/);
  assert.match(overview, /canonicalSubscriptionUiVisible/);
  assert.match(detail, /canonicalSubscriptionUiEnabled/);
  assert.match(demo, /Synthetic demonstration only/);
  assert.match(demo, /No database writes/);
  assert.match(preflight, /_prisma_migrations/);
  assert.match(preflight, /btree_gist/);
});

test("customer billing keeps financial history separate from subscription renewal operations", async () => {
  const [billing, renewals, customerSubscriptions, accountRibbon] = await Promise.all([
    readFile("app/admin/customers/[id]/billing/page.tsx", "utf8"),
    readFile("app/admin/subscriptions/[customerId]/renewals/page.tsx", "utf8"),
    readFile("app/admin/customers/[id]/subscriptions/page.tsx", "utf8"),
    readFile("components/admin/customer-overview-billing-ribbon.tsx", "utf8"),
  ]);
  assert.doesNotMatch(billing, /CustomerRenewalOpsPanel/);
  assert.match(billing, /Manage renewals/);
  assert.match(renewals, /CustomerRenewalOpsPanel/);
  assert.match(renewals, /Subscription operations/);
  assert.match(customerSubscriptions, /Billable GPS services/);
  assert.match(customerSubscriptions, /Current price/);
  assert.match(customerSubscriptions, /Device \/ SIM assignment/);
  assert.match(accountRibbon, /commercial terms and service pricing are managed in Subscriptions/);
});

test("canonical actions retain server-side authorization and do not directly invoke billing providers", async () => {
  const actions = await readFile("app/admin/subscriptions/canonical/actions.ts", "utf8");
  assert.match(actions, /createDraftCanonicalSubscription/);
  assert.match(actions, /addBillableServiceToSubscription/);
  assert.match(actions, /scheduleSubscriptionItemRate/);
  assert.match(actions, /replaceSubscriptionItemHardware/);
  assert.match(actions, /transferSubscriptionItem/);
  assert.match(actions, /transitionCanonicalSubscriptionLifecycle/);
  assert.match(actions, /assertCanonicalSubscriptionManagementAllowed/);
  assert.doesNotMatch(actions, /startStripeCheckout|createRecurringSchedule|generateRecurringInvoice|stripe\.checkout/);
});

test("detail presents negotiated classifications and server-backed annual preview", async () => {
  const detail = await readFile("app/admin/subscriptions/canonical/[subscriptionId]/page.tsx", "utf8");
  assert.match(detail, /latestRate\.classification/);
  assert.match(detail, /previewAnnualSubscriptionAddition/);
  assert.match(detail, /not an adjustment invoice or payment obligation/);
  assert.match(detail, /Annual adjustment status/);
  assert.match(detail, /Provider relationship and reconciliation/);
  assert.match(detail, /Live provider observation is unavailable/);
});

test("canonical workflow confirms commercial changes and never adds direct billing controls", async () => {
  const [forms, create, onboarding] = await Promise.all([
    readFile("components/admin/canonical-subscription-draft-forms.tsx", "utf8"),
    readFile("components/admin/canonical-subscription-create-form.tsx", "utf8"),
    readFile("components/admin/canonical-customer-onboarding-form.tsx", "utf8"),
  ]);
  assert.match(forms, /confirmCommercialChange/);
  assert.match(forms, /historical records remain unchanged/);
  assert.match(create, /Review before saving/);
  assert.match(create, /does not activate billing/);
  assert.doesNotMatch(create, /stripe\.subscriptions\.create|generateRecurringInvoice|createInvoice/);
  assert.match(onboarding, /Choose an existing customer or create a new one/);
  assert.match(onboarding, /Available device \/ SIM/);
  assert.match(onboarding, /does not activate billing or create financial records/);
  assert.doesNotMatch(onboarding, /startStripeCheckout|createRecurringSchedule|generateRecurringInvoice|stripe\.subscriptions\.create/);
});

test("onboarding actions stay within canonical draft services and do not invoke financial operations", async () => {
  const actions = await readFile("app/admin/subscriptions/canonical/actions.ts", "utf8");
  assert.match(actions, /assertCanonicalSubscriptionOnboardingAllowed/);
  assert.match(actions, /createCanonicalOnboarding/);
  assert.match(actions, /requireEditableDraft/);
  assert.doesNotMatch(actions, /startStripeCheckout|createRecurringSchedule|generateRecurringInvoice|stripe\.subscriptions\.create/);
});
