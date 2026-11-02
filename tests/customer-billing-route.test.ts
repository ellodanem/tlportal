import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { nativeBillingReadinessIssues } from "../components/admin/canonical-subscription/format";
import { customerBillingPath } from "../lib/admin/customer-billing-path";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(join(rootPath, dir), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

test("customer billing path lives in the Subscriptions area", () => {
  assert.equal(customerBillingPath("abc"), "/admin/subscriptions/customers/abc/billing");
  assert.equal(customerBillingPath("abc", "provider-invoices"), "/admin/subscriptions/customers/abc/billing#provider-invoices");
});

test("no source links to or revalidates the retired /admin/customers/[id]/billing path", async () => {
  const redirectPage = join("app", "admin", "customers", "[id]", "billing", "page.tsx");
  const helper = join("lib", "admin", "customer-billing-path.ts");
  const offenders: string[] = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const file of await sourceFiles(dir)) {
      const rel = relative(rootPath, file);
      if (rel === redirectPage || rel === helper) continue;
      const text = await readFile(file, "utf8");
      if (/\/admin\/customers\/(\$\{[^}]+\}|\[id\]|…|[^/"'`\s]+)\/billing/.test(text)) offenders.push(rel.split(sep).join("/"));
    }
  }
  assert.deepEqual(offenders, []);
});

test("the old customer billing URL permanently redirects and keeps its query string", async () => {
  const redirect = await source("app/admin/customers/[id]/billing/page.tsx");
  assert.match(redirect, /permanentRedirect/);
  assert.match(redirect, /searchParams/);
  assert.match(redirect, /customerBillingPath\(id\)/);
  assert.doesNotMatch(redirect, /loadCustomerBillingPageData|prisma/);
});

test("the customer billing workspace is a Subscriptions page that no longer uses the Customers tab bar", async () => {
  const page = await source("app/admin/subscriptions/customers/[customerId]/billing/page.tsx");
  assert.doesNotMatch(page, /CustomerSubnav/);
  assert.match(page, /Breadcrumb/);
  assert.match(page, /Subscriptions for this customer/);
  assert.match(page, /customerNewHref/);
  assert.match(page, /getCustomerFinancialLedger/);
  assert.match(page, /PaymentRemindersSection/);
});

test("subscription Billing and Invoices tabs link to customer billing", async () => {
  const [billingTab, invoicesTab] = await Promise.all([
    source("components/admin/canonical-subscription/billing-tab.tsx"),
    source("components/admin/canonical-subscription/invoices-tab.tsx"),
  ]);
  assert.match(billingTab, /\/admin\/subscriptions\/customers\/\$\{subscription\.customerId\}\/billing/);
  assert.match(invoicesTab, /\/admin\/subscriptions\/customers\/\$\{subscription\.customerId\}\/billing/);
});

test("native billing readiness issues only show for manual-invoice subscriptions", () => {
  const summary = {
    validationIssues: [
      { code: "WRONG_COLLECTION_METHOD", message: "Native recurring billing requires manual invoice collection." },
      { code: "SCHEDULE_MISSING", message: "Exactly one open recurring schedule must belong to the subscription." },
    ],
  };
  assert.deepEqual(nativeBillingReadinessIssues({ collectionMethod: "stripe_autocharge", summary }), []);
  assert.deepEqual(nativeBillingReadinessIssues({ collectionMethod: null, summary }), []);
  assert.equal(nativeBillingReadinessIssues({ collectionMethod: "manual_invoice", summary }).length, 2);
  assert.deepEqual(nativeBillingReadinessIssues({ collectionMethod: "manual_invoice", summary: null }), []);
});

test("customer billing sends canonical subscriptions to their own Billing & renewal tab, legacy rows to the old tools", async () => {
  const page = await source("app/admin/subscriptions/customers/[customerId]/billing/page.tsx");
  // Canonical subscriptions: per-subscription link, and a derived schedule is managed on the subscription.
  assert.match(page, /\/admin\/subscriptions\/canonical\/\$\{entry\.id\}\/billing/);
  assert.match(page, /derivedScheduleSubscription/);
  assert.match(page, /Manage on subscription/);
  // Legacy-only customers keep the old renewals page and the generic schedule editor.
  assert.match(page, /Manage renewals/);
  assert.match(page, /\/admin\/recurring-invoices\/\$\{recurringSchedule\.id\}/);
});

test("canonical surfaces no longer send staff to legacy customer-level renewal pages", async () => {
  const [quantity, invoicePage] = await Promise.all([
    source("components/admin/canonical-subscription/stripe-quantity-check.tsx"),
    source("app/admin/tl-invoices/[id]/page.tsx"),
  ]);
  assert.doesNotMatch(quantity, /\/renewals/);
  assert.match(quantity, /subscriptionBasePath\(subscription\.id\)\}\/services/);
  assert.match(invoicePage, /customerSubscriptionId/);
  assert.match(invoicePage, /\/admin\/subscriptions\/canonical\/\$\{invoice\.recurringSchedule\.customerSubscriptionId\}\/billing/);
});