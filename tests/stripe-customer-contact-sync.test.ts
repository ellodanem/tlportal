import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

test("Save copies email and phone onto an existing Stripe customer without creating one", async () => {
  const customer = await read("lib/stripe/customer.ts");
  assert.match(customer, /export async function syncLinkedStripeCustomerContact/);
  const sync = functionBody(customer, "syncLinkedStripeCustomerContact");
  assert.match(sync, /isStripeBillingEnabled\(\)/);
  assert.match(sync, /provider: "stripe"/);
  assert.match(sync, /if \(!existing\?\.externalCustomerId\) return \{ updated: false \}/);
  assert.doesNotMatch(sync, /customers\.create/);
  assert.match(customer, /patch\.email = email/);
  assert.match(customer, /patch\.phone = phone/);
  assert.match(customer, /patch\.name = name/);
});

test("customer profile Save syncs Stripe after the local record is stored", async () => {
  const [legacy, workspace] = await Promise.all([
    read("app/admin/customers/actions.ts"),
    read("app/admin/customer-new/actions.ts"),
  ]);
  for (const [label, source, name] of [
    ["legacy", legacy, "updateCustomer"],
    ["workspace", workspace, "updateCustomerNew"],
  ] as const) {
    const body = functionBody(source, name);
    const updateIdx = body.indexOf("prisma.customer.update");
    const syncIdx = body.indexOf("syncLinkedStripeCustomerContact");
    assert.ok(updateIdx >= 0, `${label} ${name} must save the customer`);
    assert.ok(syncIdx > updateIdx, `${label} ${name} must sync Stripe after save`);
    assert.match(body, /if \(section !== "gps"\)/);
  }
});
