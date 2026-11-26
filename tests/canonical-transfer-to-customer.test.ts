import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { subscriptionServiceTransferToCustomerPath } from "../lib/domain/canonical-subscription-navigation";

const read = (path: string) => readFile(path, "utf8");

test("the transfer-to-customer wizard is a dedicated service route with a three-step form", async () => {
  const [page, form, nav] = await Promise.all([
    read("app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/services/[itemId]/transfer/page.tsx"),
    read("components/admin/canonical-subscription-transfer-to-customer-form.tsx"),
    read("lib/domain/canonical-subscription-navigation.ts"),
  ]);
  assert.match(nav, /subscriptionServiceTransferToCustomerPath/);
  assert.equal(subscriptionServiceTransferToCustomerPath("sub-1", "item-1"), "/admin/subscriptions/canonical/sub-1/services/item-1/transfer");
  assert.match(page, /TransferToCustomerForm/);
  assert.match(page, /loadTransferToCustomerPageData/);
  assert.match(page, /requireSubscriptionPage/);
  assert.match(form, /Create a new agreement/);
  assert.match(form, /Add to an existing agreement/);
  assert.match(form, /transferCanonicalServiceToCustomerAction/);
  assert.match(form, /destinationMode/);
  assert.match(form, /QuickCustomerPicker/);
  assert.match(form, /Create a new customer/);
  assert.doesNotMatch(form, /type="date"[^>]*(min|max)=/);
});

test("the action records a dedicated audit event and lands on destination billing", async () => {
  const actions = await read("app/admin/subscriptions/canonical/actions.ts");
  const start = actions.indexOf("export async function transferCanonicalServiceToCustomerAction(");
  assert.ok(start >= 0);
  const next = actions.indexOf("\nexport async function ", start + 1);
  const body = actions.slice(start, next === -1 ? undefined : next);
  assert.match(body, /requireManageableCanonicalItem\(/);
  assert.match(body, /transferSubscriptionItemToCustomer/);
  assert.match(body, /subscription\.service_transferred_to_customer/);
  assert.match(body, /subscriptionBillingPath/);
  assert.match(body, /notice: "transferred"/);
});
