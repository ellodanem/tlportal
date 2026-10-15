import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Prisma } from "@prisma/client";

import {
  assertAtMostOneOpenItemAssignment,
  assertNoCompetingOpenProviderLinks,
  assertNoOverlappingItemRates,
  assertValidEffectiveRatePeriod,
  effectiveRatePeriodsOverlap,
  providerRateGroupFingerprint,
} from "../lib/domain/subscription-item-foundation";

const migrationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20261014233000_subscription_items_rates_provider_links/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function model(name: string) {
  const value = Prisma.dmmf.datamodel.models.find((entry) => entry.name === name);
  assert.ok(value, `${name} must exist in the generated Prisma model.`);
  return value;
}

test("customers can retain two independent same-frequency subscriptions", () => {
  const subscription = model("CustomerSubscription");
  assert.equal(subscription.fields.find((field) => field.name === "customerId")?.isUnique, false);
  assert.equal(
    subscription.uniqueFields.some((fields) =>
      fields.includes("customerId") || fields.includes("billingIntervalMonths"),
    ),
    false,
  );
});

test("one subscription can contain multiple stable commercial items", () => {
  const subscription = model("CustomerSubscription");
  const item = model("SubscriptionItem");
  assert.equal(subscription.fields.find((field) => field.name === "items")?.isList, true);
  assert.equal(item.fields.find((field) => field.name === "customerSubscriptionId")?.isRequired, true);
});

test("standard, negotiated, and explicit annual prices remain cycle amounts", () => {
  const classification = Prisma.dmmf.datamodel.enums.find(
    (entry) => entry.name === "SubscriptionRateClassification",
  );
  assert.deepEqual(classification?.values.map((value) => value.name), ["standard", "negotiated"]);
  assert.equal(
    providerRateGroupFingerprint({
      currency: "XCD",
      billingIntervalMonths: 1,
      agreedAmountPerCycle: "25",
    }),
    "XCD:1:25.00",
  );
  assert.equal(
    providerRateGroupFingerprint({
      currency: "xcd",
      billingIntervalMonths: 1,
      agreedAmountPerCycle: "20.0",
    }),
    "XCD:1:20.00",
  );
  assert.equal(
    providerRateGroupFingerprint({
      currency: "XCD",
      billingIntervalMonths: 12,
      agreedAmountPerCycle: "275",
    }),
    "XCD:12:275.00",
  );
});

test("effective rates use valid half-open date-only periods", () => {
  const january = {
    subscriptionItemId: "item-1",
    billingIntervalMonths: 1,
    effectiveFrom: "2026-01-01",
    effectiveUntil: "2026-02-01",
  };
  const february = {
    ...january,
    effectiveFrom: "2026-02-01",
    effectiveUntil: "2026-03-01",
  };

  assert.doesNotThrow(() => assertValidEffectiveRatePeriod(january));
  assert.equal(effectiveRatePeriodsOverlap(january, february), false);
  assert.doesNotThrow(() => assertNoOverlappingItemRates([january, february]));
  assert.throws(
    () => assertValidEffectiveRatePeriod({ ...january, effectiveUntil: "2026-01-01" }),
    /later than effectiveFrom/,
  );
});

test("overlapping rates are rejected for the same item and billing basis", () => {
  const current = {
    subscriptionItemId: "item-1",
    billingIntervalMonths: 1,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
  };
  const conflicting = {
    ...current,
    effectiveFrom: "2026-06-01",
  };

  assert.equal(effectiveRatePeriodsOverlap(current, conflicting), true);
  assert.throws(
    () => assertNoOverlappingItemRates([current, conflicting]),
    /cannot overlap/,
  );
  assert.doesNotThrow(() =>
    assertNoOverlappingItemRates([
      current,
      { ...conflicting, subscriptionItemId: "item-2" },
      { ...conflicting, billingIntervalMonths: 12 },
    ]),
  );
});

test("hardware replacement preserves item identity and assignment history", () => {
  assert.doesNotThrow(() =>
    assertAtMostOneOpenItemAssignment([
      { subscriptionItemId: "item-1", endDate: "2026-05-10", status: "cancelled" },
      { subscriptionItemId: "item-1", endDate: null, status: "active" },
      { subscriptionItemId: null, endDate: null },
    ]),
  );
  assert.doesNotThrow(() =>
    assertAtMostOneOpenItemAssignment([
      { subscriptionItemId: "item-1", endDate: null, status: "cancelled" },
      { subscriptionItemId: "item-1", endDate: null, status: "active" },
    ]),
  );
  assert.throws(
    () =>
      assertAtMostOneOpenItemAssignment([
        { subscriptionItemId: "item-1", endDate: null, status: "active" },
        { subscriptionItemId: "item-1", endDate: null, status: "due_soon" },
      ]),
    /multiple open hardware assignments/,
  );
});

test("subscription transfers preserve predecessor ownership", () => {
  const item = model("SubscriptionItem");
  assert.equal(item.fields.find((field) => field.name === "predecessorItemId")?.isUnique, true);
  assert.equal(item.fields.find((field) => field.name === "predecessorItem")?.relationName, "SubscriptionItemTransfer");
  assert.equal(item.fields.find((field) => field.name === "successorItem")?.relationName, "SubscriptionItemTransfer");
});

test("provider history permits ended links but rejects competing open links", () => {
  assert.doesNotThrow(() =>
    assertNoCompetingOpenProviderLinks([
      {
        customerSubscriptionId: "subscription-1",
        provider: "stripe",
        endedAt: "2026-05-01",
      },
      { customerSubscriptionId: "subscription-1", provider: "stripe", endedAt: null },
    ]),
  );
  assert.throws(
    () =>
      assertNoCompetingOpenProviderLinks([
        { customerSubscriptionId: "subscription-1", provider: "stripe", endedAt: null },
        { customerSubscriptionId: "subscription-1", provider: "stripe", endedAt: null },
      ]),
    /competing open links/,
  );
  assert.match(migrationSql, /SubscriptionProviderLink_one_open_provider_idx/);
});

test("provider items map one external item to one rate group", () => {
  const providerItem = model("SubscriptionProviderItem");
  assert.equal(
    providerItem.fields.find((field) => field.name === "externalSubscriptionItemId")?.isUnique,
    true,
  );
  assert.ok(
    providerItem.uniqueFields.some(
      (fields) =>
        fields.join(",") === "subscriptionProviderLinkId,rateGroupFingerprint",
    ),
  );
});

test("invoice snapshots retain financial values and service identity", () => {
  const snapshot = model("InvoiceServiceSnapshot");
  for (const fieldName of [
    "serviceLabelSnapshot",
    "agreedAmountPerCycleSnapshot",
    "billedAmount",
    "currency",
    "servicePeriodStart",
    "servicePeriodEnd",
    "providerInvoiceLineReference",
    "quantity",
  ]) {
    assert.ok(snapshot.fields.some((field) => field.name === fieldName));
  }
  assert.equal(snapshot.fields.find((field) => field.name === "invoiceId")?.isRequired, true);
  assert.equal(snapshot.fields.find((field) => field.name === "subscriptionItemId")?.isRequired, false);
  assert.equal(snapshot.fields.find((field) => field.name === "subscriptionItemRateId")?.isRequired, false);
  assert.equal(
    snapshot.fields.find((field) => field.name === "subscriptionItem")?.relationOnDelete,
    "Restrict",
  );
  assert.equal(
    snapshot.fields.find((field) => field.name === "subscriptionItemRate")?.relationOnDelete,
    "Restrict",
  );
});

test("legacy assignment and provider invoice relationships remain nullable and unbackfilled", () => {
  const assignment = model("ServiceAssignment");
  const providerInvoice = model("BillingInvoice");
  assert.equal(assignment.fields.find((field) => field.name === "subscriptionItemId")?.isRequired, false);
  assert.equal(
    assignment.fields.find((field) => field.name === "subscriptionItem")?.relationOnDelete,
    "SetNull",
  );
  assert.equal(
    providerInvoice.fields.find((field) => field.name === "customerSubscriptionId")?.isRequired,
    false,
  );
  assert.equal(
    providerInvoice.fields.find((field) => field.name === "subscriptionProviderLinkId")?.isRequired,
    false,
  );
  assert.doesNotMatch(migrationSql, /UPDATE\s+"(?:ServiceAssignment|BillingInvoice|CustomerSubscription)"/i);
  assert.doesNotMatch(migrationSql, /DROP\s+(?:COLUMN|TABLE|TYPE)/i);
});

test("PostgreSQL constraints encode open-link, open-assignment, and rate-overlap rules", () => {
  assert.match(migrationSql, /CREATE EXTENSION IF NOT EXISTS btree_gist/);
  assert.match(migrationSql, /SubscriptionItemRate_no_overlapping_effective_periods/);
  assert.match(migrationSql, /daterange\("effectiveFrom", "effectiveUntil", '\[\)'\) WITH &&/);
  assert.match(migrationSql, /ServiceAssignment_one_open_subscription_item_idx/);
  assert.match(
    migrationSql,
    /WHERE "subscriptionItemId" IS NOT NULL AND "endDate" IS NULL AND "status" <> 'cancelled'/,
  );
});
