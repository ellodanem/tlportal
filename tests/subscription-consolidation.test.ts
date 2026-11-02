import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  customerHasCanonicalAuthority,
  isCanonicalOwnedSchedule,
} from "../lib/domain/canonical-ownership";
import {
  activeSubscriptionTab,
  advancedSectionsFor,
  subscriptionTabs,
} from "../lib/domain/canonical-subscription-navigation";
import {
  buildFinancialLedger,
  NOT_LINKED_LABEL,
  type LedgerNativeInvoice,
  type LedgerPayment,
  type LedgerProviderInvoice,
} from "../lib/domain/financial-ledger";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function native(overrides: Partial<LedgerNativeInvoice> = {}): LedgerNativeInvoice {
  return {
    id: "inv-1", number: "TL-1", status: "open", kind: "service", total: 110, amountPaid: 0, amountDue: 110, currency: "XCD",
    issueDate: day("2026-01-10"), dueDate: day("2026-01-24"), customerSubscriptionId: null, billingInvoiceId: null, archivedAt: null,
    ...overrides,
  };
}

function provider(overrides: Partial<LedgerProviderInvoice> = {}): LedgerProviderInvoice {
  return {
    id: "bi-1", number: "STR-1", status: "open", amount: 330, currency: "XCD", createdAt: day("2026-01-05"), paidAt: null,
    customerSubscriptionId: "sub-1", provider: "stripe", ...overrides,
  };
}

function payment(overrides: Partial<LedgerPayment> = {}): LedgerPayment {
  return { id: "pay-1", invoiceId: "inv-1", amount: 50, currency: "XCD", method: "cash", receivedAt: day("2026-01-12"), voidedAt: null, reference: null, ...overrides };
}

// ---- Canonical ownership -------------------------------------------------------------------

test("a schedule is canonical-owned only when its subscription is canonical", () => {
  assert.equal(isCanonicalOwnedSchedule({ customerSubscription: { controlMode: "canonical" } }), true);
  assert.equal(isCanonicalOwnedSchedule({ customerSubscription: { controlMode: "legacy" } }), false);
  assert.equal(isCanonicalOwnedSchedule({ customerSubscription: { controlMode: "shadow" } }), false);
  assert.equal(isCanonicalOwnedSchedule({ customerSubscription: null }), false);
  assert.equal(isCanonicalOwnedSchedule(null), false);
});

test("customer canonical authority ignores terminal and non-canonical subscriptions", () => {
  assert.equal(customerHasCanonicalAuthority([]), false);
  assert.equal(customerHasCanonicalAuthority([{ controlMode: "legacy", lifecycleStatus: "active" }]), false);
  assert.equal(customerHasCanonicalAuthority([{ controlMode: "canonical", lifecycleStatus: "ended" }, { controlMode: "canonical", lifecycleStatus: "canceled" }]), false);
  assert.equal(customerHasCanonicalAuthority([{ controlMode: "canonical", lifecycleStatus: "draft" }]), true);
  assert.equal(customerHasCanonicalAuthority([{ controlMode: "canonical", lifecycleStatus: "paused" }]), true);
});

test("legacy mutators consult canonical ownership guards on the server", async () => {
  const [schedule, runNow, subscriptions, billing, pause, renewal, guards] = await Promise.all([
    readFile("lib/services/native-recurring-schedule-service.ts", "utf8"),
    readFile("app/admin/recurring-invoices/actions.ts", "utf8"),
    readFile("app/admin/subscriptions/actions.ts", "utf8"),
    readFile("app/admin/customers/billing-actions.ts", "utf8"),
    readFile("lib/services/service-pause-service.ts", "utf8"),
    readFile("lib/services/assignment-renewal-service.ts", "utf8"),
    readFile("lib/services/canonical-ownership-guard-service.ts", "utf8"),
  ]);
  assert.match(guards, /import "server-only"/);
  assert.match(schedule, /assertScheduleNotCanonicalOwned/);
  assert.match(schedule, /assertAssignmentNotCanonical/);
  assert.match(runNow, /assertScheduleNotCanonicalOwned\(scheduleId\)/);
  assert.match(subscriptions, /customerHasCanonicalSubscription\(customerId\)/);
  assert.match(billing, /assertCustomerNotCanonicalManaged\(customerId\)/);
  assert.match(pause, /controlMode: \{ not: "canonical" \}/);
  assert.match(renewal, /legacyRenewalAssignmentWhere/);
  assert.match(renewal, /subscriptionItemId: null/);
});

// ---- Navigation ----------------------------------------------------------------------------

test("subscription tabs are real routes and Advanced only appears when relevant", () => {
  const without = subscriptionTabs("sub-1", { showAdvanced: false });
  assert.deepEqual(without.map((tab) => tab.key), ["services", "billing", "activity"]);
  // Services is the landing section; there is no separate overview tab.
  assert.equal(without[0].href, "/admin/subscriptions/canonical/sub-1/services");
  assert.ok(without.every((tab) => !tab.href.includes("#")));
  assert.equal(subscriptionTabs("sub-1", { showAdvanced: true }).at(-1)?.href, "/admin/subscriptions/canonical/sub-1/advanced");
});

test("active tab resolves from the first child segment", () => {
  assert.equal(activeSubscriptionTab(null), "services");
  assert.equal(activeSubscriptionTab(undefined), "services");
  assert.equal(activeSubscriptionTab("services"), "services");
  assert.equal(activeSubscriptionTab("billing"), "billing");
  // The retired Invoices & payments route redirects to Billing and must not leave no tab active.
  assert.equal(activeSubscriptionTab("invoices"), "billing");
  assert.equal(activeSubscriptionTab("add-service"), "services");
});

test("the subscription index redirects to Services and keeps the query string", async () => {
  const index = await readFile("app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/page.tsx", "utf8");
  assert.match(index, /redirect\(/);
  assert.match(index, /\/services\$\{suffix\}/);
  assert.match(index, /searchParams/);
  const services = await readFile("app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/services/page.tsx", "utf8");
  assert.match(services, /error=\{query\.error\}/);
  assert.match(services, /pilot=\{query\.pilot\}/);
  const tab = await readFile("components/admin/canonical-subscription/services-tab.tsx", "utf8");
  assert.match(tab, /<SubscriptionNotices /);
});

test("manual-invoice customers with no provider history never see provider pages", () => {
  const sections = advancedSectionsFor({ controlMode: "canonical", collectionMethod: "manual_invoice", providerLinkCount: 0, billingOperationCount: 0, migrationSourceKind: null });
  assert.deepEqual(sections, { provider: false, stripeAdoption: false, pilotTransfer: false, any: false });
  assert.equal(advancedSectionsFor({ controlMode: "shadow", collectionMethod: "stripe_autocharge", providerLinkCount: 0, billingOperationCount: 0, migrationSourceKind: null }).stripeAdoption, true);
  assert.equal(advancedSectionsFor({ controlMode: "canonical", collectionMethod: "manual_invoice", providerLinkCount: 1, billingOperationCount: 0, migrationSourceKind: null }).provider, true);
  assert.equal(advancedSectionsFor({ controlMode: "canonical", collectionMethod: "manual_invoice", providerLinkCount: 0, billingOperationCount: 0, migrationSourceKind: "manual_schedule" }).pilotTransfer, true);
});

// ---- Financial ledger ----------------------------------------------------------------------

test("a Stripe mirror and its provider invoice are one ledger row", () => {
  const ledger = buildFinancialLedger({
    scope: { type: "customer" },
    nativeInvoices: [native({ id: "inv-m", billingInvoiceId: "bi-1", customerSubscriptionId: "sub-1", total: 330, amountDue: 330 })],
    providerInvoices: [provider()],
    payments: [],
  });
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0].source, "stripe");
  assert.equal(ledger.totalsByCurrency[0].invoiced, 330);
  assert.equal(ledger.outstanding?.amount, 330);
});

test("a manual staff invoice is shown as not linked and kept out of subscription scope", () => {
  const inputs = { nativeInvoices: [native({ id: "inv-manual" })], providerInvoices: [], payments: [] };
  const customer = buildFinancialLedger({ scope: { type: "customer" }, ...inputs });
  assert.equal(customer.rows.length, 1);
  assert.equal(customer.rows[0].subscriptionId, null);
  const scoped = buildFinancialLedger({ scope: { type: "subscription", subscriptionId: "sub-1" }, ...inputs });
  assert.equal(scoped.rows.length, 0);
  assert.equal(scoped.unlinked.count, 1);
  assert.deepEqual(scoped.unlinked.outstandingByCurrency, [{ currency: "XCD", amount: 110 }]);
  assert.equal(NOT_LINKED_LABEL, "Not linked to a subscription");
});

test("drafts, voids and archived invoices are never billed or outstanding", () => {
  const ledger = buildFinancialLedger({
    scope: { type: "customer" },
    nativeInvoices: [
      native({ id: "a", status: "draft" }), native({ id: "b", status: "void" }), native({ id: "c", archivedAt: day("2026-02-01") }), native({ id: "d", status: "written_off" }),
      native({ id: "e", total: 40, amountDue: 40 }),
    ],
    providerInvoices: [],
    payments: [],
  });
  assert.equal(ledger.totalsByCurrency[0].invoiced, 40);
  assert.equal(ledger.totalsByCurrency[0].outstanding, 40);
  assert.equal(ledger.unlinked.count, 1);
});

test("payments come only from non-voided Payment rows and never double count", () => {
  const ledger = buildFinancialLedger({
    scope: { type: "customer" },
    nativeInvoices: [native({ amountPaid: 50, amountDue: 60 })],
    providerInvoices: [],
    payments: [payment(), payment({ id: "pay-void", voidedAt: day("2026-01-13"), amount: 999 })],
  });
  assert.equal(ledger.payments.length, 1);
  assert.equal(ledger.totalsByCurrency[0].paymentsReceived, 50);
});

test("money is never summed across currencies", () => {
  const ledger = buildFinancialLedger({
    scope: { type: "customer" },
    nativeInvoices: [native({ id: "x" }), native({ id: "y", currency: "USD", total: 20, amountDue: 20 })],
    providerInvoices: [],
    payments: [],
  });
  assert.equal(ledger.totalsByCurrency.length, 2);
  assert.equal(ledger.outstanding, null);
});

test("an agreed partial-period charge stays distinct from the annual rate", () => {
  const ledger = buildFinancialLedger({
    scope: { type: "subscription", subscriptionId: "sub-1" },
    nativeInvoices: [
      native({ id: "adj", kind: "subscription_adjustment", total: 110, amountDue: 110, customerSubscriptionId: "sub-1" }),
      native({ id: "annual", total: 330, amountDue: 330, customerSubscriptionId: "sub-1", issueDate: day("2026-02-01") }),
    ],
    providerInvoices: [],
    payments: [],
  });
  assert.deepEqual(ledger.rows.map((entry) => entry.total).sort(), [110, 330]);
  assert.equal(ledger.totalsByCurrency[0].invoiced, 440);
});

test("customer and subscription ledgers agree on the linked rows", () => {
  const nativeInvoices = [native({ id: "a", customerSubscriptionId: "sub-1" }), native({ id: "b", customerSubscriptionId: "sub-2" }), native({ id: "c" })];
  const customer = buildFinancialLedger({ scope: { type: "customer" }, nativeInvoices, providerInvoices: [], payments: [] });
  const one = buildFinancialLedger({ scope: { type: "subscription", subscriptionId: "sub-1" }, nativeInvoices, providerInvoices: [], payments: [] });
  const two = buildFinancialLedger({ scope: { type: "subscription", subscriptionId: "sub-2" }, nativeInvoices, providerInvoices: [], payments: [] });
  assert.equal(customer.totalsByCurrency[0].outstanding, one.totalsByCurrency[0].outstanding + two.totalsByCurrency[0].outstanding + 110);
});

// ---- Structure -----------------------------------------------------------------------------

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test("subscription management surfaces have no collapsed sections or hidden anchors", async () => {
  const files = [
    ...await sourceFiles("components/admin/canonical-subscription"),
    ...await sourceFiles("app/admin/subscriptions/canonical/[subscriptionId]"),
    "components/admin/customer-service-management-modal.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /<details[\s>]/, `${file} must not use collapsed <details>`);
    assert.doesNotMatch(source, /#advanced|#service-management|#billing["'`]|#invoices["'`]|#history/, `${file} must not link to in-page hidden anchors`);
  }
});

test("each subscription tab has a route and invoices are visible by default on Billing", async () => {
  for (const segment of ["services", "billing", "activity", "advanced"]) {
    const page = await readFile(`app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/${segment}/page.tsx`, "utf8");
    assert.match(page, /requireSubscriptionPage/);
  }
  const billing = await readFile("components/admin/canonical-subscription/billing-tab.tsx", "utf8");
  assert.match(billing, /getSubscriptionFinancials/);
  assert.match(billing, /NOT_LINKED_LABEL/);
  assert.match(billing, /SubscriptionLedgerTable/);
  assert.doesNotMatch(billing, /<details/);
});

test("the retired Invoices & payments route redirects to Billing and nothing links to it", async () => {
  const redirectPage = await readFile("app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/invoices/page.tsx", "utf8");
  assert.match(redirectPage, /redirect\(subscriptionBillingPath\(/);
  for (const file of [
    "components/admin/canonical-subscription/subscription-notices.tsx",
    "components/admin/financial-ledger-table.tsx",
    "components/admin/canonical-subscription/billing-tab.tsx",
  ]) {
    assert.doesNotMatch(await readFile(file, "utf8"), /\/invoices`/, `${file} must link to Billing, not the retired invoices route`);
  }
});

test("adding a service has a single entry point", async () => {
  const header = await readFile("components/admin/canonical-subscription/subscription-header.tsx", "utf8");
  assert.match(header, /subscriptionAddServicePath/);
  const overview = await readFile("components/admin/canonical-subscription/subscription-notices.tsx", "utf8");
  const services = await readFile("components/admin/canonical-subscription/services-tab.tsx", "utf8");
  assert.doesNotMatch(`${overview}\n${services}`, /AddCanonicalDraftItemForm/);
});

test("page renders do not write: no Stripe reconcile and no read-marking on render", async () => {
  const pages = [
    "app/admin/subscriptions/customers/[customerId]/billing/page.tsx",
    "app/admin/customers/[id]/subscriptions/page.tsx",
    "app/admin/customers/[id]/page.tsx",
    "app/admin/customers/[id]/messages/page.tsx",
    "app/admin/subscriptions/customers/[customerId]/messages/page.tsx",
    "app/admin/subscriptions/customers/[customerId]/statements/page.tsx",
    "app/admin/subscriptions/customers/[customerId]/activity/page.tsx",
    "components/admin/customer-messages-panel.tsx",
    "components/admin/customer-activity-panel.tsx",
    "components/admin/customer-statements-panel.tsx",
  ];
  for (const page of pages) {
    const source = await readFile(page, "utf8");
    assert.doesNotMatch(source, /reconcileLatestStripeInvoiceForCustomer/, `${page} must not reconcile during render`);
    assert.doesNotMatch(source, /markWhatsAppConversationRead\(/, `${page} must not mark read during render`);
  }
  const messages = await readFile("components/admin/customer-messages-panel.tsx", "utf8");
  assert.match(messages, /MarkWhatsAppReadOnView/);
});

test("customer surfaces have one authoritative place per operation", async () => {
  const [header, expand, actions, billing, summary, subscriptions] = await Promise.all([
    readFile("components/admin/customer-workspace-header.tsx", "utf8"),
    readFile("components/admin/customer-services-expand.tsx", "utf8"),
    readFile("components/admin/customer-assignment-service-actions.tsx", "utf8"),
    readFile("app/admin/subscriptions/customers/[customerId]/billing/page.tsx", "utf8"),
    readFile("components/admin/customer-collection-summary.tsx", "utf8"),
    readFile("app/admin/customers/[id]/subscriptions/page.tsx", "utf8"),
  ]);
  // Header: visible links, new subscription offered, no competing standalone schedule creator.
  assert.doesNotMatch(header, /<details/);
  assert.match(header, /New subscription/);
  assert.doesNotMatch(header, /recurring-invoices\/new/);
  // List expander: no legacy "Mark paid" shortcut; canonical services link to their service page.
  assert.doesNotMatch(expand, /Mark paid|markAssignmentPeriodPaidAction/);
  assert.match(expand, /canonicalServiceHref/);
  assert.match(actions, /canonicalServiceHref/);
  // Billing: shared ledger, provider invoices always rendered, no collapsed advanced block.
  assert.match(billing, /getCustomerFinancialLedger/);
  assert.match(billing, /NOT_LINKED_LABEL/);
  assert.doesNotMatch(billing, /<details/);
  // Truthful empty states.
  assert.match(summary, /hasRecordedInvoices/);
  assert.doesNotMatch(subscriptions, /"No invoice history"/);
  assert.match(subscriptions, /NOT_LINKED_LABEL/);
});

test("stored Traqcare passwords are never serialised into page payloads", async () => {
  const [panel, customerPage, editPage, actions] = await Promise.all([
    readFile("components/admin/customer-portal-users-panel.tsx", "utf8"),
    readFile("app/admin/customers/[id]/page.tsx", "utf8"),
    readFile("app/admin/customers/[id]/edit/page.tsx", "utf8"),
    readFile("app/admin/customers/portal-user-actions.ts", "utf8"),
  ]);
  assert.doesNotMatch(panel, /traqcarePassword:\s*string/);
  assert.doesNotMatch(panel, /user\.traqcarePassword/);
  assert.doesNotMatch(customerPage, /traqcarePassword:\s*u\.traqcarePassword/);
  assert.doesNotMatch(editPage, /traqcarePassword:\s*u\.traqcarePassword/);
  assert.match(panel, /revealPortalUserPasswordAction/);
  assert.match(actions, /export async function revealPortalUserPasswordAction/);
  assert.match(actions, /customer\.portal_credential_revealed/);
});

test("add-service handles drafts inline so there is a single entry point", async () => {
  const page = await readFile("app/admin/subscriptions/canonical/[subscriptionId]/add-service/page.tsx", "utf8");
  assert.match(page, /AddCanonicalDraftItemForm/);
  assert.match(page, /SubscriptionAddServiceFlow/);
  assert.doesNotMatch(page, /Finish setup from its details page/);
});