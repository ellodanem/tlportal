import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { CanonicalStripeAdoptionError, matchExistingStripeProviderItems } from "../lib/services/canonical-stripe-adoption-service";

const expected = {
  groups: [{
    fingerprint: "rate-group-25-monthly",
    currency: "XCD",
    billingIntervalMonths: 1,
    agreedAmountPerCycle: new Prisma.Decimal("25.00"),
    quantity: 4,
    recurringTotal: new Prisma.Decimal("100.00"),
    items: [],
    subscriptionItemIds: ["one", "two", "three", "four"],
    classifications: ["standard"],
  }],
} as never;

test("existing Stripe billing adoption maps an exact legacy rate group without creating a provider object", () => {
  const mappings = matchExistingStripeProviderItems(expected, [{
    externalSubscriptionItemId: "si_existing",
    externalPriceId: "price_existing",
    currency: "xcd",
    billingIntervalMonths: 1,
    unitAmount: "25.00",
    quantity: 4,
  }]);
  assert.deepEqual(mappings, [{
    externalSubscriptionItemId: "si_existing",
    externalPriceId: "price_existing",
    currency: "XCD",
    billingIntervalMonths: 1,
    agreedAmountPerCycle: "25.00",
    quantity: 4,
    rateGroupFingerprint: "rate-group-25-monthly",
  }]);
});

test("existing Stripe billing adoption rejects a price, quantity, or extra-item mismatch", () => {
  for (const observed of [
    [{ externalSubscriptionItemId: "si_existing", externalPriceId: "price_existing", currency: "XCD", billingIntervalMonths: 1, unitAmount: "20.00", quantity: 4 }],
    [{ externalSubscriptionItemId: "si_existing", externalPriceId: "price_existing", currency: "XCD", billingIntervalMonths: 1, unitAmount: "25.00", quantity: 3 }],
    [
      { externalSubscriptionItemId: "si_existing", externalPriceId: "price_existing", currency: "XCD", billingIntervalMonths: 1, unitAmount: "25.00", quantity: 4 },
      { externalSubscriptionItemId: "si_extra", externalPriceId: "price_extra", currency: "XCD", billingIntervalMonths: 1, unitAmount: "10.00", quantity: 1 },
    ],
  ]) {
    assert.throws(
      () => matchExistingStripeProviderItems(expected, observed),
      (error: unknown) => error instanceof CanonicalStripeAdoptionError,
    );
  }
});
