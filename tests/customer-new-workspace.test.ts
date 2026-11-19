import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { customerNewEditHref, customerNewHref } from "../lib/admin/customer-new";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Customer (New) edit stays in the new workspace", () => {
  assert.equal(customerNewEditHref("abc"), "/admin/customer-new/abc/edit");
  assert.equal(customerNewHref({ c: "abc", archiveError: "busy" }), "/admin/customer-new?c=abc&archiveError=busy");
});

test("Customer (New) create stays lean and edit covers the old tab jobs", async () => {
  const [createPage, createForm, editPage, editForm, detail, actions] = await Promise.all([
    source("app/admin/customer-new/create/page.tsx"),
    source("components/admin/customer-new/create-customer-form.tsx"),
    source("app/admin/customer-new/[id]/edit/page.tsx"),
    source("components/admin/customer-new/edit-customer-profile-form.tsx"),
    source("components/admin/customer-new/customer-detail.tsx"),
    source("app/admin/customer-new/actions.ts"),
  ]);

  assert.match(createPage, /GPS, portal users, contacts/);
  assert.match(createForm, /After you create/);
  assert.doesNotMatch(createForm, /traqcareClientId|Portal users|Archive customer/);

  assert.match(editPage, /Edit profile/);
  assert.match(editForm, /name="legalInfo"/);
  assert.match(editForm, /name="invoiceCc"/);
  assert.match(editForm, /updateCustomerNew/);
  assert.doesNotMatch(editForm, /traqcareClientId/);

  assert.match(detail, /CustomerGpsCard/);
  assert.match(detail, /CustomerPortalUsersPanel/);
  assert.match(detail, /CustomerContactsPanel/);
  assert.match(detail, /ArchiveCustomerNewButton/);
  assert.match(detail, /Finish setup/);
  assert.match(detail, /customerNewEditHref\(customer\.id\)/);
  assert.doesNotMatch(detail, /\/admin\/customers\/\$\{customer\.id\}\/edit/);

  assert.match(actions, /export async function updateCustomerNew/);
  assert.match(actions, /export async function archiveCustomerNew/);
  assert.match(actions, /export async function deleteCustomerNew/);
  assert.match(actions, /redirect\(customerNewHref\(\{ c: id \}\)\)/);
});

test("portal and contact mutations refresh Customer (New)", async () => {
  const [portal, contacts] = await Promise.all([
    source("app/admin/customers/portal-user-actions.ts"),
    source("app/admin/customers/contact-actions.ts"),
  ]);
  assert.match(portal, /revalidatePath\("\/admin\/customer-new"\)/);
  assert.match(contacts, /revalidatePath\("\/admin\/customer-new"\)/);
  assert.match(contacts, /export async function updateCustomerContactAction/);
});
