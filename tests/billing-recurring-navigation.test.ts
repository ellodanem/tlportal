import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Billing navigation keeps recurring schedules reachable through their existing URL", async () => {
  const workspace = await source("components/admin/billing-workspace.tsx");
  const recurringPage = await source("app/admin/recurring-invoices/page.tsx");

  assert.match(workspace, /\["\/admin\/recurring-invoices", "Recurring invoices", "recurring"\]/);
  assert.match(recurringPage, /BillingWorkspaceHeader active="recurring"/);
  assert.match(recurringPage, /primaryHref="\/admin\/recurring-invoices\/new"/);
  assert.match(recurringPage, /Stripe-managed subscriptions remain under Stripe authority/);
});

test("Customer billing exposes an existing manual recurring schedule without creating one", async () => {
  const customerBilling = await source("app/admin/customers/[id]/billing/page.tsx");

  assert.match(customerBilling, /prisma\.recurringInvoiceSchedule\.findFirst/);
  assert.match(customerBilling, /href=\{`\/admin\/recurring-invoices\/\$\{recurringSchedule\.id\}`\}/);
  assert.doesNotMatch(customerBilling, /createRecurringSchedule\(/);
});
