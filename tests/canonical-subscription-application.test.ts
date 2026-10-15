import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalSubscriptionValidationError,
  assertLifecycleTransition,
  canonicalGracePeriodDays,
  exactCycleAmount,
  normalizedMonthlyRecurringRevenue,
  previewAnnualProration,
  recurringEffectiveDateForAddition,
  sumExactCycleAmounts,
} from "../lib/domain/canonical-subscription-application";

test("canonical drafts retain the seven-day default grace period", () => {
  assert.equal(canonicalGracePeriodDays(), 7);
  assert.equal(canonicalGracePeriodDays(0), 0);
});

test("monthly additions join recurring billing at the next renewal", () => {
  assert.equal(
    recurringEffectiveDateForAddition({
      serviceActivatedDate: "2026-10-15",
      nextRenewalDate: "2026-11-01",
    }),
    "2026-11-01",
  );
});

test("activation exactly on a renewal boundary creates no date shift", () => {
  assert.equal(
    recurringEffectiveDateForAddition({
      serviceActivatedDate: "2027-01-01",
      nextRenewalDate: "2027-01-01",
    }),
    "2027-01-01",
  );
});

test("stale renewal dates are rejected instead of guessing a new anniversary", () => {
  assert.throws(
    () => recurringEffectiveDateForAddition({
      serviceActivatedDate: "2026-11-02",
      nextRenewalDate: "2026-11-01",
    }),
    (error) => error instanceof CanonicalSubscriptionValidationError
      && error.code === "STALE_RENEWAL_DATE",
  );
});

test("annual proration uses remaining calendar days and half-up currency rounding", () => {
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
  assert.equal(preview.futureRecurringEffectiveDate, "2027-01-01");
  assert.equal(preview.currency, "XCD");
});

test("annual proration handles leap-year periods", () => {
  const preview = previewAnnualProration({
    annualPeriodStart: "2024-01-01",
    annualPeriodEnd: "2025-01-01",
    serviceActivatedDate: "2024-07-01",
    agreedAnnualAmount: "275.00",
    currency: "XCD",
  });

  assert.equal(preview.totalCalendarDays, 366);
  assert.equal(preview.remainingCalendarDays, 184);
  assert.equal(preview.proratedAmount.toFixed(2), "138.25");
});

test("annual activation on renewal produces no partial-period adjustment", () => {
  const preview = previewAnnualProration({
    annualPeriodStart: "2026-01-01",
    annualPeriodEnd: "2027-01-01",
    serviceActivatedDate: "2027-01-01",
    agreedAnnualAmount: "275.00",
    currency: "XCD",
  });

  assert.equal(preview.remainingCalendarDays, 0);
  assert.equal(preview.proratedAmount.toFixed(2), "0.00");
  assert.equal(preview.futureRecurringEffectiveDate, "2027-01-01");
});

test("standard and negotiated item rates total EC$70 exactly", () => {
  assert.equal(
    sumExactCycleAmounts(["25.00", "25.00", "20.00"]).toFixed(2),
    "70.00",
  );
});

test("explicit EC$275 annual pricing normalizes without changing the contract amount", () => {
  const annual = exactCycleAmount("275.00");
  assert.equal(annual.toFixed(2), "275.00");
  assert.equal(normalizedMonthlyRecurringRevenue(annual, 12).toFixed(2), "22.92");
});

test("money inputs require exact nonnegative two-place values", () => {
  assert.throws(() => exactCycleAmount("25.001"), /no more than two decimal places/);
  assert.throws(() => exactCycleAmount("-1.00"), /non-negative/);
});

test("commercial lifecycle transitions reject backwards activation changes", () => {
  assert.doesNotThrow(() => assertLifecycleTransition("draft", "pending_activation"));
  assert.doesNotThrow(() => assertLifecycleTransition("pending_activation", "active"));
  assert.doesNotThrow(() => assertLifecycleTransition("active", "paused"));
  assert.throws(
    () => assertLifecycleTransition("active", "draft"),
    (error) => error instanceof CanonicalSubscriptionValidationError
      && error.code === "INVALID_LIFECYCLE_TRANSITION",
  );
  assert.throws(() => assertLifecycleTransition("ended", "active"), /cannot move/);
});
