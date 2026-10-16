import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  annualAdjustmentConfirmationToken,
  annualAdjustmentGenerationKey,
  assertCanonicalAnnualAdjustmentExecutionEnabled,
  CanonicalAnnualAdjustmentError,
  canonicalAnnualAdjustmentExecutionEnabled,
  resolveCurrentAnnualPeriod,
} from "../lib/domain/canonical-annual-adjustment";
import { previewAnnualProration } from "../lib/domain/canonical-subscription-application";

test("annual adjustment reuses exact EC$275 half-up proration", () => {
  const preview = previewAnnualProration({
    annualPeriodStart: "2026-01-01",
    annualPeriodEnd: "2027-01-01",
    serviceActivatedDate: "2026-04-01",
    agreedAnnualAmount: "275.00",
    currency: "xcd",
  });
  assert.equal(preview.totalCalendarDays, 365);
  assert.equal(preview.remainingCalendarDays, 275);
  assert.equal(preview.proratedAmount.toFixed(2), "207.19");
  assert.equal(preview.currency, "XCD");
});

test("annual adjustment counts leap-year calendar days and permits a zero renewal boundary", () => {
  const leap = previewAnnualProration({
    annualPeriodStart: "2024-01-01",
    annualPeriodEnd: "2025-01-01",
    serviceActivatedDate: "2024-07-01",
    agreedAnnualAmount: "275.00",
    currency: "XCD",
  });
  assert.equal(leap.totalCalendarDays, 366);
  assert.equal(leap.remainingCalendarDays, 184);
  assert.equal(leap.proratedAmount.toFixed(2), "138.25");

  const boundary = previewAnnualProration({
    annualPeriodStart: "2026-01-01",
    annualPeriodEnd: "2027-01-01",
    serviceActivatedDate: "2027-01-01",
    agreedAnnualAmount: "275.00",
    currency: "XCD",
  });
  assert.equal(boundary.remainingCalendarDays, 0);
  assert.equal(boundary.proratedAmount.toFixed(2), "0.00");
});

test("annual anniversary resolution preserves the original cadence", () => {
  const period = resolveCurrentAnnualPeriod({
    billingAnchorDate: new Date("2024-02-29T00:00:00.000Z"),
    nextBillingDate: new Date("2026-03-01T00:00:00.000Z"),
  });
  assert.equal(period.periodStart.toISOString().slice(0, 10), "2025-03-01");
  assert.equal(period.periodEnd.toISOString().slice(0, 10), "2026-03-01");

  assert.throws(
    () => resolveCurrentAnnualPeriod({
      billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
      nextBillingDate: new Date("2027-01-02T00:00:00.000Z"),
    }),
    (caught: unknown) => caught instanceof CanonicalAnnualAdjustmentError
      && caught.code === "ANNUAL_ANNIVERSARY_MISMATCH",
  );
});

test("adjustment key and confirmation token are stable and source-sensitive", () => {
  const preview = previewAnnualProration({
    annualPeriodStart: "2026-01-01",
    annualPeriodEnd: "2027-01-01",
    serviceActivatedDate: "2026-10-16",
    agreedAnnualAmount: "275.00",
    currency: "XCD",
  });
  const generationKey = annualAdjustmentGenerationKey(
    "item-1",
    new Date("2026-01-01T12:00:00.000Z"),
    new Date("2027-01-01T12:00:00.000Z"),
  );
  assert.equal(generationKey, "annual-proration:item-1:2026-01-01:2027-01-01");
  const input = {
    subscriptionId: "subscription-1",
    subscriptionItemId: "item-1",
    subscriptionItemRateId: "rate-1",
    generationKey,
    collectionMethod: "manual_invoice",
    preview,
  };
  const first = annualAdjustmentConfirmationToken(input);
  assert.equal(first, annualAdjustmentConfirmationToken(input));
  assert.notEqual(first, annualAdjustmentConfirmationToken({ ...input, collectionMethod: "stripe_autocharge" }));
});

test("production remains hard-disabled even when the annual adjustment flag is enabled", () => {
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({
    NODE_ENV: "test",
    CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true",
  }), true);
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({
    NODE_ENV: "production",
    CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true",
  }), false);
  assert.equal(canonicalAnnualAdjustmentExecutionEnabled({
    NODE_ENV: "test",
    VERCEL_ENV: "production",
    CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true",
  }), false);
  assert.throws(
    () => assertCanonicalAnnualAdjustmentExecutionEnabled({
      NODE_ENV: "production",
      CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true",
    }),
    (caught: unknown) => caught instanceof CanonicalAnnualAdjustmentError
      && caught.code === "PRODUCTION_EXECUTION_DISABLED",
  );
});

test("Phase 3P migration is additive and enforces adjustment idempotency", () => {
  const migration = readFileSync(
    new URL("../prisma/migrations/20261016100000_annual_proration_adjustments/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ALTER TYPE "InvoiceKind" ADD VALUE 'annual_adjustment'/);
  assert.match(migration, /ADD COLUMN "adjustmentGenerationKey" TEXT/);
  assert.match(migration, /CREATE UNIQUE INDEX "Invoice_adjustmentGenerationKey_key"/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|TRUNCATE)\b/i);
});
