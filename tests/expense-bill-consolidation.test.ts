import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("legacy expenses migrate into the vendor bill ledger with payment history", () => {
  const migration = read("prisma/migrations/20261022120000_unify_expenses_and_bills/migration.sql");
  assert.match(migration, /INSERT INTO "VendorBill"/);
  assert.match(migration, /'paid'::"VendorBillStatus"/);
  assert.match(migration, /INSERT INTO "VendorBillPayment"/);
  assert.match(migration, /e\."receiptStoragePath"/);
  assert.match(migration, /DROP TABLE "Expense"/);
});

test("the schema has one expense ledger and keeps expense metadata", () => {
  const schema = read("prisma/schema.prisma");
  assert.doesNotMatch(schema, /model Expense \{/);
  assert.match(schema, /model VendorBill \{/);
  assert.match(schema, /category\s+ExpenseCategory\?/);
  assert.match(schema, /receiptStoragePath\s+String\?/);
});

test("admin navigation exposes one expense entry and legacy URLs redirect", () => {
  const sidebar = read("components/admin-sidebar.tsx");
  assert.match(sidebar, /href: "\/admin\/bills", label: "Expenses"/);
  assert.doesNotMatch(sidebar, /label: "Paid expenses"/);
  assert.match(read("app/admin/expenses/page.tsx"), /permanentRedirect\("\/admin\/bills"\)/);
  assert.match(read("app/admin/purchases/page.tsx"), /permanentRedirect\("\/admin\/bills"\)/);
});
