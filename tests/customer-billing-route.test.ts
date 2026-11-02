import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { nativeBillingReadinessIssues } from "../components/admin/canonical-subscription/format";
import { customerBillingPath } from "../lib/admin/customer-billing-path";
import { activeCustomerWorkspaceTab, CUSTOMER_WORKSPACE_TABS, customerWorkspacePath } from "../lib/admin/customer-workspace-path";

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

test("customer billing is a Subscriptions page that no longer uses the Customers tab bar", async () => {
  const [page, layout] = await Promise.all([
    source("app/admin/subscriptions/customers/[customerId]/billing/page.tsx"),
    source("app/admin/subscriptions/customers/[customerId]/layout.tsx"),
  ]);
  assert.doesNotMatch(`${page}\n${layout}`, /CustomerSubnav/);
  assert.match(layout, /Breadcrumb/);
  assert.match(layout, /Subscriptions for this customer/);
  assert.match(layout, /customerNewHref/);
  assert.match(page, /getCustomerFinancialLedger/);
  assert.match(page, /PaymentRemindersSection/);
});

test("the customer workspace has Billing, Statements, Messages and Activity as real routes", async () => {
  for (const tab of CUSTOMER_WORKSPACE_TABS) {
    const page = await source(`app/admin/subscriptions/customers/[customerId]/${tab.key}/page.tsx`);
    assert.ok(page.length > 0, `${tab.key} page exists`);
    assert.equal(customerWorkspacePath("c1", tab.key), `/admin/subscriptions/customers/c1/${tab.key}`);
  }
  assert.deepEqual(CUSTOMER_WORKSPACE_TABS.map((tab) => tab.key), ["billing", "statements", "messages", "activity"]);
  assert.equal(activeCustomerWorkspaceTab("messages"), "messages");
  assert.equal(activeCustomerWorkspaceTab(null), "billing");
  assert.equal(activeCustomerWorkspaceTab("unknown"), "billing");
  const index = await source("app/admin/subscriptions/customers/[customerId]/page.tsx");
  assert.match(index, /redirect\(customerWorkspacePath\(customerId, "billing"\)\)/);
});

test("the old Customers tabs still exist and share their bodies with the new workspace", async () => {
  const pairs: [string, string, RegExp][] = [
    ["app/admin/customers/[id]/statements/page.tsx", "app/admin/subscriptions/customers/[customerId]/statements/page.tsx", /CustomerStatementsPanel/],
    ["app/admin/customers/[id]/messages/page.tsx", "app/admin/subscriptions/customers/[customerId]/messages/page.tsx", /CustomerMessagesPanel/],
    ["app/admin/customers/[id]/activity/page.tsx", "app/admin/subscriptions/customers/[customerId]/activity/page.tsx", /CustomerActivityPanel/],
  ];
  for (const [legacy, current, panel] of pairs) {
    const [legacySource, currentSource] = await Promise.all([source(legacy), source(current)]);
    assert.match(legacySource, panel, `${legacy} uses the shared panel`);
    assert.match(currentSource, panel, `${current} uses the shared panel`);
    assert.match(legacySource, /CustomerSubnav/, `${legacy} keeps the Customers tab bar for now`);
  }
});

test("actions that change messages or activity refresh both the old and new workspace pages", async () => {
  const [messageActions, noteActions, billingActions, templateActions] = await Promise.all([
    source("app/admin/customers/[id]/messages/actions.ts"),
    source("app/admin/customers/note-actions.ts"),
    source("app/admin/customers/billing-actions.ts"),
    source("app/admin/message-templates/actions.ts"),
  ]);
  for (const [name, text, tab] of [
    ["message actions", messageActions, "messages"],
    ["note actions", noteActions, "activity"],
    ["billing actions", billingActions, "messages"],
    ["template actions", templateActions, "messages"],
  ] as const) {
    assert.match(text, new RegExp(`revalidatePath\\(\`/admin/customers/\\$\\{[\\w.]+\\}/${tab}\`\\)`), `${name} refresh the old ${tab} page`);
    assert.match(text, new RegExp(`customerWorkspacePath\\([\\w.]+, "${tab}"\\)`), `${name} refresh the new ${tab} page`);
  }
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
test("entry points open the Subscriptions customer workspace and Customer (New), not the old Customers tabs", async () => {
  const [detail, subscriptionHeader, workspaceHeader] = await Promise.all([
    source("components/admin/customer-new/customer-detail.tsx"),
    source("components/admin/canonical-subscription/subscription-header.tsx"),
    source("components/admin/customer-workspace-header.tsx"),
  ]);
  // Customer (New): quick links to every workspace tab, plus billing and activity shortcuts.
  assert.match(detail, /CUSTOMER_WORKSPACE_TABS\.map/);
  assert.match(detail, /customerWorkspacePath\(customer\.id, "billing"\)/);
  assert.match(detail, /customerWorkspacePath\(customer\.id, "activity"\)/);
  // Subscription breadcrumb: the customer name opens Customer (New), not the old overview.
  assert.match(subscriptionHeader, /customerNewHref\(\{ c: subscription\.customerId \}\)/);
  assert.doesNotMatch(subscriptionHeader, /\/admin\/customers\/\$\{subscription\.customerId\}/);
  // The old workspace's Message button opens the new Messages tab.
  assert.match(workspaceHeader, /customerWorkspacePath\(customer\.id, "messages"\)/);
  assert.doesNotMatch(workspaceHeader, /\/admin\/customers\/\$\{customer\.id\}\/messages/);
});