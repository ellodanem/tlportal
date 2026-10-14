import assert from "node:assert/strict";
import test from "node:test";

import { customerArchiveBillingBlockReason } from "../lib/billing/customer-archive-billing-guard";

test("archive is blocked when recurring billing remains active", () => {
  const reason = customerArchiveBillingBlockReason({
    stripeSubscriptions: 1,
    recurringSchedules: 1,
    unresolvedCheckoutOperations: 0,
    stripeAccountsWithoutLocalSubscription: 0,
  });
  assert.match(reason ?? "", /cannot be archived/i);
  assert.match(reason ?? "", /did not change Stripe/i);
});

test("archive remains available when no billing arrangement is unresolved", () => {
  assert.equal(
    customerArchiveBillingBlockReason({
      stripeSubscriptions: 0,
      recurringSchedules: 0,
      unresolvedCheckoutOperations: 0,
      stripeAccountsWithoutLocalSubscription: 0,
    }),
    null,
  );
});
