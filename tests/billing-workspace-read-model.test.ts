import assert from "node:assert/strict";
import test from "node:test";

import { summarizeBillingWorkspace } from "@/lib/billing/billing-workspace-read-model";

test("billing workspace totals one currency without duplicating paid provider records", () => {
  const summary = summarizeBillingWorkspace({
    currency: "XCD",
    nativeInvoices: [
      { currency: "XCD", status: "paid", total: 100, amountPaid: 100, amountDue: 0 },
      { currency: "XCD", status: "partially_paid", total: 80, amountPaid: 30, amountDue: 50 },
      { currency: "USD", status: "overdue", total: 75, amountPaid: 0, amountDue: 75 },
    ],
    providerInvoices: [
      { currency: "XCD", status: "paid", amount: 60 },
      { currency: "XCD", status: "open", amount: 40 },
      { currency: "USD", status: "paid", amount: 20 },
    ],
  });

  assert.deepEqual(summary, {
    totalInvoiced: 240,
    outstanding: 50,
    overdue: 0,
    collected: 190,
    outstandingCount: 1,
    overdueCount: 0,
  });
});
