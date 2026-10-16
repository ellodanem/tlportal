import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma } from "@prisma/client";

import {
  assertCanonicalStripeShadowEnabled,
  buildCanonicalStripeRateGroups,
  canonicalStripePaymentReplayKey,
  CanonicalStripeShadowError,
  planCanonicalStripeInvoiceAttribution,
  planCanonicalStripeOperations,
  reconcileCanonicalStripeSubscription,
  type CanonicalStripeConfigurationInput,
  type LocalStripeProviderLink,
  type ObservedStripeSubscription,
} from "../lib/domain/canonical-stripe-shadow";

function rate(id: string, amount: string, interval = 1, classification: "standard" | "negotiated" = "standard") {
  return {
    id,
    billingIntervalMonths: interval,
    agreedAmountPerCycle: new Prisma.Decimal(amount),
    currency: "XCD",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveUntil: null,
    classification,
  };
}

function configuration(input: {
  id?: string;
  interval?: 1 | 3 | 6 | 12;
  amounts?: { id: string; label?: string; amount: string; classification?: "standard" | "negotiated" }[];
  controlMode?: "legacy" | "shadow" | "canonical";
} = {}): CanonicalStripeConfigurationInput {
  const interval = input.interval ?? 1;
  return {
    id: input.id ?? "subscription-1",
    customerId: "customer-1",
    controlMode: input.controlMode ?? "shadow",
    collectionMethod: "stripe_autocharge",
    lifecycleStatus: "active",
    billingIntervalMonths: interval,
    currency: "XCD",
    billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
    nextBillingDate: new Date(interval === 12 ? "2027-01-01T00:00:00.000Z" : "2026-11-01T00:00:00.000Z"),
    items: (input.amounts ?? [
      { id: "service-a", amount: "25.00" },
      { id: "service-b", amount: "25.00" },
      { id: "service-c", amount: "20.00", classification: "negotiated" },
    ]).map((entry) => ({
      id: entry.id,
      label: entry.label ?? entry.id,
      status: "active",
      billingEffectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      billingEffectiveUntil: null,
      rates: [rate(`rate-${entry.id}`, entry.amount, interval, entry.classification)],
    })),
  };
}

function providerState(expected = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T00:00:00.000Z"))) {
  const providerItems = expected.groups.map((group, index) => ({
    id: `mapping-${index}`,
    subscriptionProviderLinkId: "link-1",
    externalSubscriptionItemId: `si-${index}`,
    externalPriceId: `price-${index}`,
    currency: group.currency,
    billingIntervalMonths: group.billingIntervalMonths,
    agreedAmountPerCycle: group.agreedAmountPerCycle,
    quantity: group.quantity,
    rateGroupFingerprint: group.fingerprint,
  }));
  const link: LocalStripeProviderLink = {
    id: "link-1",
    customerSubscriptionId: expected.subscriptionId,
    provider: "stripe",
    externalSubscriptionId: "sub-stripe-1",
    providerStatus: "active",
    endedAt: null,
    providerItems,
  };
  const observed: ObservedStripeSubscription = {
    externalSubscriptionId: link.externalSubscriptionId,
    status: "active",
    currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    items: providerItems.map((item) => ({
      externalSubscriptionItemId: item.externalSubscriptionItemId,
      externalPriceId: item.externalPriceId,
      currency: item.currency,
      billingIntervalMonths: item.billingIntervalMonths,
      unitAmount: item.agreedAmountPerCycle,
      quantity: item.quantity,
    })),
  };
  return { link, observed };
}

test("groups EC$25 x2 and negotiated EC$20 x1 into an exact EC$70 monthly plan", () => {
  const result = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T12:00:00.000Z"));
  assert.equal(result.expectedRecurringTotal.toFixed(2), "70.00");
  assert.deepEqual(result.groups.map((group) => ({
    amount: group.agreedAmountPerCycle.toFixed(2),
    quantity: group.quantity,
    total: group.recurringTotal.toFixed(2),
  })), [
    { amount: "20.00", quantity: 1, total: "20.00" },
    { amount: "25.00", quantity: 2, total: "50.00" },
  ]);
  const negotiated = result.groups.find((group) => group.agreedAmountPerCycle.equals(20))!;
  assert.equal(negotiated.items[0].classification, "negotiated");
  assert.equal(negotiated.items[0].subscriptionItemRateId, "rate-service-c");
});

test("uses explicit quarterly, six-month, and annual agreed prices without deriving discounts", () => {
  for (const [interval, amount] of [[3, "72.50"], [6, "140.00"], [12, "275.00"]] as const) {
    const config = configuration({ interval, amounts: [{ id: `service-${interval}`, amount }] });
    const result = buildCanonicalStripeRateGroups(config, config.nextBillingDate!);
    assert.equal(result.billingIntervalMonths, interval);
    assert.equal(result.expectedRecurringTotal.toFixed(2), amount);
    assert.equal(result.groups[0].agreedAmountPerCycle.toFixed(2), amount);
  }
});

test("same-customer subscriptions remain independent and plans are deterministic", () => {
  const first = buildCanonicalStripeRateGroups(configuration({ id: "subscription-a" }), new Date("2026-11-01T00:00:00.000Z"));
  const repeated = buildCanonicalStripeRateGroups(configuration({ id: "subscription-a" }), new Date("2026-11-01T00:00:00.000Z"));
  const second = buildCanonicalStripeRateGroups(configuration({ id: "subscription-b" }), new Date("2026-11-01T00:00:00.000Z"));
  assert.deepEqual(first.groups, repeated.groups);
  assert.equal(first.subscriptionId, "subscription-a");
  assert.equal(second.subscriptionId, "subscription-b");
  assert.notEqual(first.subscriptionId, second.subscriptionId);
});

test("missing and interval-inconsistent rates are rejected", () => {
  const missing = configuration();
  missing.items[0].rates = [];
  assert.throws(
    () => buildCanonicalStripeRateGroups(missing, missing.nextBillingDate!),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError && caught.code === "ITEM_RATE_MISSING",
  );
  const inconsistent = configuration();
  inconsistent.items[0].rates[0].billingIntervalMonths = 12;
  assert.throws(
    () => buildCanonicalStripeRateGroups(inconsistent, inconsistent.nextBillingDate!),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError && caught.code === "ITEM_RATE_MISSING",
  );
});

test("exact provider ownership, items, quantities, prices, totals and anchor reconcile as matched", () => {
  const expected = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T00:00:00.000Z"));
  const { link, observed } = providerState(expected);
  const result = reconcileCanonicalStripeSubscription({
    expected,
    providerLink: link,
    observed,
    observedOwnerSubscriptionId: expected.subscriptionId,
  });
  assert.equal(result.status, "matched");
  assert.equal(result.observedRecurringTotal, "70.00");
  assert.deepEqual(result.issues, []);
});

test("reconciliation classifies price, quantity, anchor, ownership, missing and unexpected evidence", () => {
  const expected = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T00:00:00.000Z"));
  const { link, observed } = providerState(expected);
  observed.currentPeriodStart = new Date("2026-09-01T00:00:00.000Z");
  observed.items[0].unitAmount = "21.00";
  observed.items[1].quantity = 3;
  observed.items.push({
    externalSubscriptionItemId: "si-unexpected",
    externalPriceId: "price-unexpected",
    currency: "XCD",
    billingIntervalMonths: 1,
    unitAmount: "5.00",
    quantity: 1,
  });
  const result = reconcileCanonicalStripeSubscription({
    expected,
    providerLink: link,
    observed,
    observedOwnerSubscriptionId: "subscription-other",
  });
  assert.equal(result.status, "ownership_conflict");
  const codes = new Set(result.issues.map((entry) => entry.code));
  for (const code of [
    "subscription_ownership_conflict",
    "billing_anchor_mismatch",
    "price_mismatch",
    "quantity_mismatch",
    "unexpected_provider_item",
    "recurring_total_mismatch",
  ]) assert.equal(codes.has(code as never), true, code);

  const missingMapping = { ...link, providerItems: link.providerItems.slice(1) };
  const incomplete = reconcileCanonicalStripeSubscription({ expected, providerLink: missingMapping, observed });
  assert.equal(incomplete.status, "insufficient_evidence");
  assert.equal(incomplete.issues.some((entry) => entry.code === "missing_provider_mapping"), true);
});

test("operation previews are stable, non-executable, anchor-preserving, and create no pending operation", () => {
  const expected = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T00:00:00.000Z"));
  const { link, observed } = providerState(expected);
  observed.items[0].quantity = 2;
  const reconciliation = reconcileCanonicalStripeSubscription({ expected, providerLink: link, observed });
  const first = planCanonicalStripeOperations({ expected, providerLink: link, observed, reconciliation });
  const second = planCanonicalStripeOperations({ expected, providerLink: link, observed, reconciliation });
  assert.equal(first.operationKey, second.operationKey);
  assert.equal(first.requestFingerprint, second.requestFingerprint);
  assert.equal(first.executable, false);
  assert.equal(first.createsBillingOperation, false);
  assert.equal(first.preserveBillingAnchor, true);
  assert.equal(first.prorationBehavior, "none");
  assert.equal(first.actions.some((action) => action.kind === "update_quantity"), true);
});

test("grouped provider invoice lines produce immutable per-service attribution and stable replay keys", () => {
  const expected = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T00:00:00.000Z"));
  const { link } = providerState(expected);
  const lines = link.providerItems.map((mapping) => {
    const group = expected.groups.find((entry) => entry.fingerprint === mapping.rateGroupFingerprint)!;
    return {
      externalInvoiceLineId: `il-${mapping.id}`,
      externalSubscriptionItemId: mapping.externalSubscriptionItemId,
      externalPriceId: mapping.externalPriceId,
      currency: "XCD",
      quantity: group.quantity,
      recurringSubtotal: group.recurringTotal,
    };
  });
  const first = planCanonicalStripeInvoiceAttribution({
    externalInvoiceId: "in-1",
    externalSubscriptionId: link.externalSubscriptionId,
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-11-01T00:00:00.000Z"),
    expected,
    providerLink: link,
    lines,
  });
  const repeated = planCanonicalStripeInvoiceAttribution({
    externalInvoiceId: "in-1",
    externalSubscriptionId: link.externalSubscriptionId,
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-11-01T00:00:00.000Z"),
    expected,
    providerLink: link,
    lines: [...lines].reverse(),
  });
  assert.equal(first.status, "complete");
  assert.equal(first.snapshots.length, 3);
  assert.equal(first.snapshots.reduce((sum, entry) => sum + Number(entry.billedAmount), 0), 70);
  assert.deepEqual(first, repeated);
  assert.equal(first.snapshots.find((entry) => entry.subscriptionItemId === "service-c")?.serviceLabelSnapshot, "service-c");
});

test("discounts, tax, credits and unmatched invoice evidence are reported rather than allocated", () => {
  const expected = buildCanonicalStripeRateGroups(configuration(), new Date("2026-11-01T00:00:00.000Z"));
  const { link } = providerState(expected);
  const mapping = link.providerItems[0];
  const group = expected.groups.find((entry) => entry.fingerprint === mapping.rateGroupFingerprint)!;
  const result = planCanonicalStripeInvoiceAttribution({
    externalInvoiceId: "in-limited",
    externalSubscriptionId: link.externalSubscriptionId,
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-11-01T00:00:00.000Z"),
    expected,
    providerLink: link,
    lines: [{
      externalInvoiceLineId: "il-discounted",
      externalSubscriptionItemId: mapping.externalSubscriptionItemId,
      externalPriceId: mapping.externalPriceId,
      currency: "XCD",
      quantity: group.quantity,
      recurringSubtotal: group.recurringTotal,
      discountAmount: "1.00",
      taxAmount: "0.50",
      creditAmount: "0.25",
    }],
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.snapshots, []);
  assert.deepEqual(result.unattributedLineIds, ["il-discounted"]);
  assert.match(result.allocationLimitations[0], /discounts, taxes, or credits/);
});

test("legacy subscriptions and production are hard-disabled while replay identifiers remain stable", () => {
  assert.throws(
    () => buildCanonicalStripeRateGroups(configuration({ controlMode: "legacy" }), new Date("2026-11-01T00:00:00.000Z")),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError && caught.code === "LEGACY_SUBSCRIPTION_PROTECTED",
  );
  assert.throws(
    () => assertCanonicalStripeShadowEnabled({
      NODE_ENV: "production",
      CANONICAL_STRIPE_SHADOW_ENABLED: "true",
    }),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError && caught.code === "PRODUCTION_SHADOW_DISABLED",
  );
  assert.throws(
    () => assertCanonicalStripeShadowEnabled({
      NODE_ENV: "test",
      VERCEL_ENV: "production",
      CANONICAL_STRIPE_SHADOW_ENABLED: "true",
    }),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError && caught.code === "PRODUCTION_SHADOW_DISABLED",
  );
  assert.equal(
    canonicalStripePaymentReplayKey("in-1", "pi-1"),
    canonicalStripePaymentReplayKey("in-1", "pi-1"),
  );
  assert.notEqual(
    canonicalStripePaymentReplayKey("in-1", "pi-1"),
    canonicalStripePaymentReplayKey("in-1", "pi-2"),
  );
});
