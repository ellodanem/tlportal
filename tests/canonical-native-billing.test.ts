import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import {
  assertCanonicalNativeBillingExecutionEnabled,
  CanonicalNativeBillingError,
  deriveCanonicalCollectionHealth,
  resolveCanonicalBillingCycle,
} from "../lib/domain/canonical-native-billing";

function rate(
  id: string,
  amount: string,
  options: { interval?: number; from?: string; until?: string | null; classification?: "standard" | "negotiated" } = {},
) {
  return {
    id,
    billingIntervalMonths: options.interval ?? 1,
    agreedAmountPerCycle: new Prisma.Decimal(amount),
    currency: "XCD",
    effectiveFrom: new Date(`${options.from ?? "2026-01-01"}T00:00:00.000Z`),
    effectiveUntil: options.until ? new Date(`${options.until}T00:00:00.000Z`) : null,
    classification: options.classification ?? "standard" as const,
  };
}

function item(
  id: string,
  amount: string,
  options: { from?: string; until?: string | null; rates?: ReturnType<typeof rate>[] } = {},
) {
  return {
    id,
    label: id,
    status: "active" as const,
    billingEffectiveFrom: new Date(`${options.from ?? "2026-01-01"}T00:00:00.000Z`),
    billingEffectiveUntil: options.until ? new Date(`${options.until}T00:00:00.000Z`) : null,
    rates: options.rates ?? [rate(`rate-${id}`, amount)],
  };
}

test("canonical execution is opt-in locally and remains hard-disabled in production", () => {
  assert.throws(
    () => assertCanonicalNativeBillingExecutionEnabled({ NODE_ENV: "test" }),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError && caught.code === "FEATURE_DISABLED",
  );
  assert.doesNotThrow(() => assertCanonicalNativeBillingExecutionEnabled({
    NODE_ENV: "test",
    CANONICAL_NATIVE_BILLING_ENABLED: "true",
  }));
  assert.throws(
    () => assertCanonicalNativeBillingExecutionEnabled({
      NODE_ENV: "production",
      CANONICAL_NATIVE_BILLING_ENABLED: "true",
    }),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError
      && caught.code === "PRODUCTION_EXECUTION_DISABLED",
  );
  assert.doesNotThrow(() => assertCanonicalNativeBillingExecutionEnabled({
    NODE_ENV: "production",
    CANONICAL_PRODUCTION_MANUAL_ENABLED: "true",
    CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID: "customer-1",
    CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID: "subscription-1",
  }, { customerId: "customer-1", subscriptionId: "subscription-1", activationStatus: null }));
  assert.throws(
    () => assertCanonicalNativeBillingExecutionEnabled({
      NODE_ENV: "production",
      CANONICAL_PRODUCTION_MANUAL_ENABLED: "true",
      CANONICAL_PRODUCTION_MANUAL_CUSTOMER_ID: "customer-1",
      CANONICAL_PRODUCTION_MANUAL_SUBSCRIPTION_ID: "subscription-1",
    }, { customerId: "customer-1", subscriptionId: "other", activationStatus: null }),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError
      && caught.code === "PRODUCTION_EXECUTION_DISABLED",
  );
});

test("mixed standard and negotiated item prices resolve exactly to EC$70", () => {
  const cycle = resolveCanonicalBillingCycle({
    lifecycleStatus: "active",
    billingIntervalMonths: 1,
    currency: "xcd",
    items: [
      item("Service A", "25.00"),
      item("Service B", "25.00"),
      item("Service C", "20.00", {
        rates: [rate("rate-c", "20.00", { classification: "negotiated" })],
      }),
    ],
  }, new Date("2026-11-01T12:00:00.000Z"));

  assert.equal(cycle.subtotal.toFixed(2), "70.00");
  assert.deepEqual(cycle.lines.map((line) => line.classification), ["standard", "standard", "negotiated"]);
});

test("a complete draft can be previewed without becoming eligible for execution", () => {
  const configuration = {
    lifecycleStatus: "draft" as const,
    billingIntervalMonths: 1,
    currency: "XCD",
    items: [item("Draft service", "25.00")],
  };
  const periodStart = new Date("2026-11-01T00:00:00.000Z");
  const cycle = resolveCanonicalBillingCycle(configuration, periodStart, { requireActive: false });
  assert.equal(cycle.subtotal.toFixed(2), "25.00");

  assert.throws(
    () => resolveCanonicalBillingCycle(configuration, periodStart),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError
      && caught.code === "SUBSCRIPTION_NOT_ACTIVE",
  );
});

test("explicit annual, quarterly, and six-month prices remain per-cycle amounts", () => {
  for (const [interval, amount] of [[12, "275.00"], [3, "60.00"], [6, "115.00"]] as const) {
    const cycle = resolveCanonicalBillingCycle({
      lifecycleStatus: "active",
      billingIntervalMonths: interval,
      currency: "XCD",
      items: [item(`${interval}-month`, amount, {
        rates: [rate(`rate-${interval}`, amount, { interval })],
      })],
    }, new Date("2027-01-01T00:00:00.000Z"));
    assert.equal(cycle.subtotal.toFixed(2), amount);
  }
});

test("half-open periods apply additions, rate changes, and removals on their approved boundaries", () => {
  const changedRates = [
    rate("old", "25.00", { until: "2026-12-01" }),
    rate("new", "20.00", { from: "2026-12-01", classification: "negotiated" }),
  ];
  const before = resolveCanonicalBillingCycle({
    lifecycleStatus: "active",
    billingIntervalMonths: 1,
    currency: "XCD",
    items: [
      item("changing", "25.00", { rates: changedRates }),
      item("removed", "25.00", { until: "2026-12-01" }),
      item("addition", "25.00", { from: "2026-12-01" }),
    ],
  }, new Date("2026-11-01T00:00:00.000Z"));
  assert.equal(before.subtotal.toFixed(2), "50.00");
  assert.deepEqual(before.lines.map((line) => line.description), ["changing", "removed"]);

  const onBoundary = resolveCanonicalBillingCycle({
    lifecycleStatus: "active",
    billingIntervalMonths: 1,
    currency: "XCD",
    items: [
      item("changing", "25.00", { rates: changedRates }),
      item("removed", "25.00", { until: "2026-12-01" }),
      item("addition", "25.00", { from: "2026-12-01" }),
    ],
  }, new Date("2026-12-01T00:00:00.000Z"));
  assert.equal(onBoundary.subtotal.toFixed(2), "45.00");
  assert.deepEqual(onBoundary.lines.map((line) => line.description), ["changing", "addition"]);
});

test("missing financial evidence is actionable instead of becoming a zero-priced line", () => {
  assert.throws(
    () => resolveCanonicalBillingCycle({
      lifecycleStatus: "active",
      billingIntervalMonths: 12,
      currency: "XCD",
      items: [item("annual-without-evidence", "0.00", { rates: [] })],
    }, new Date("2027-01-01T00:00:00.000Z")),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError && caught.code === "ITEM_RATE_MISSING",
  );
});

test("partial balances become staff attention only after the seven-day grace period", () => {
  const invoices = [{ amountDue: "40.00", dueDate: new Date("2026-10-01T00:00:00.000Z") }];
  const withinGrace = deriveCanonicalCollectionHealth({
    invoices,
    gracePeriodDays: 7,
    asOf: new Date("2026-10-08T12:00:00.000Z"),
  });
  assert.equal(withinGrace.status, "past_due");
  assert.equal(withinGrace.outstandingBalance.toFixed(2), "40.00");
  assert.equal(withinGrace.attentionRequired, false);

  const afterGrace = deriveCanonicalCollectionHealth({
    invoices,
    gracePeriodDays: 7,
    asOf: new Date("2026-10-09T00:00:00.000Z"),
  });
  assert.equal(afterGrace.status, "action_required");
  assert.equal(afterGrace.attentionRequired, true);
});
