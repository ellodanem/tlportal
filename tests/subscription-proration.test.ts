import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeProration,
  cycleWindowForRenewal,
  parseMoneyToCents,
  recurringTotalsAfterAddition,
  roundedMonthsBetween,
  SubscriptionProrationError,
} from "../lib/domain/subscription-proration";

const plastic = {
  startDate: "2026-10-27",
  renewalDate: "2027-02-13",
  billingIntervalMonths: 12,
  cycleAmount: "330.00",
  currency: "XCD",
};

test("daily proration uses the agreed annual price, not the 12-month list price", () => {
  const result = computeProration({ ...plastic, method: "daily_proration" });
  // EC$330/yr already contains the free month; 360/yr would give a different figure.
  assert.equal(result.totalDays, 365);
  assert.equal(result.remainingDays, 109);
  assert.equal(result.amount, "98.55");
  assert.equal(result.isOverride, false);
  assert.equal(result.coveredThrough, "2027-02-12");
  const wrongBase = computeProration({ ...plastic, cycleAmount: "360.00", method: "daily_proration" });
  assert.notEqual(wrongBase.amount, result.amount);
});

test("Plastic Solutions: 4 rounded months x EC$27.50 = EC$110.00, distinct from the daily amount", () => {
  const result = computeProration({
    ...plastic,
    method: "monthly_rounded",
    reason: "Agreed with customer: four months at the monthly equivalent.",
  });
  assert.equal(result.roundedMonths, 4);
  assert.equal(result.monthlyRate, "27.50");
  assert.equal(result.amount, "110.00");
  assert.equal(result.dailyAmount, "98.55");
  assert.equal(result.isOverride, true);
});

test("rounded months and manual amounts require recorded audit context", () => {
  for (const method of ["monthly_rounded", "manual_amount"] as const) {
    assert.throws(
      () => computeProration({ ...plastic, method, manualAmount: "110.00" }),
      (caught: unknown) => caught instanceof SubscriptionProrationError && caught.code === "REASON_REQUIRED",
    );
  }
  const manual = computeProration({ ...plastic, method: "manual_amount", manualAmount: "110", reason: "Agreed on site visit" });
  assert.equal(manual.amount, "110.00");
  assert.equal(manual.reason, "Agreed on site visit");
});

test("manual amounts are bounded by one cycle and two decimal places", () => {
  assert.throws(
    () => computeProration({ ...plastic, method: "manual_amount", manualAmount: "330.01", reason: "x" }),
    (caught: unknown) => caught instanceof SubscriptionProrationError && caught.code === "MANUAL_AMOUNT_EXCEEDS_CYCLE",
  );
  assert.throws(() => parseMoneyToCents("10.005"), SubscriptionProrationError);
  assert.throws(() => parseMoneyToCents("-1"), SubscriptionProrationError);
  assert.equal(parseMoneyToCents("27.5"), 2750);
});

test("day boundaries: renewal-day start is zero, cycle-start start is the full cycle", () => {
  const atRenewal = computeProration({ ...plastic, startDate: "2027-02-13", method: "daily_proration" });
  assert.equal(atRenewal.amount, "0.00");
  const atCycleStart = computeProration({ ...plastic, startDate: "2026-02-13", method: "daily_proration" });
  assert.equal(atCycleStart.amount, "330.00");
  assert.throws(
    () => computeProration({ ...plastic, startDate: "2026-02-12", method: "daily_proration" }),
    (caught: unknown) => caught instanceof SubscriptionProrationError && caught.code === "START_BEFORE_CYCLE",
  );
  assert.throws(
    () => computeProration({ ...plastic, startDate: "2027-02-14", method: "daily_proration" }),
    (caught: unknown) => caught instanceof SubscriptionProrationError && caught.code === "START_AFTER_RENEWAL",
  );
});

test("leap-year cycles use 366 days and half-up currency rounding", () => {
  const leap = computeProration({
    startDate: "2024-07-01",
    renewalDate: "2025-01-01",
    billingIntervalMonths: 12,
    cycleAmount: "275.00",
    currency: "xcd",
    method: "daily_proration",
  });
  assert.equal(leap.totalDays, 366);
  assert.equal(leap.remainingDays, 184);
  assert.equal(leap.amount, "138.25");
  assert.equal(leap.currency, "XCD");
});

test("other cadences use the cycle that ends on the renewal", () => {
  assert.deepEqual(cycleWindowForRenewal("2026-11-09", 1), { cycleStart: "2026-10-09", cycleEnd: "2026-11-09", totalDays: 31 });
  const monthly = computeProration({
    startDate: "2026-10-27",
    renewalDate: "2026-11-09",
    billingIntervalMonths: 1,
    cycleAmount: "30.00",
    currency: "XCD",
    method: "daily_proration",
  });
  assert.equal(monthly.remainingDays, 13);
  assert.equal(monthly.amount, "12.58");
  const quarterly = cycleWindowForRenewal("2027-03-31", 3);
  assert.equal(quarterly.cycleStart, "2026-12-31");
});

test("rounded months: nearest whole month with half rounding up", () => {
  assert.equal(roundedMonthsBetween("2026-10-27", "2027-02-13"), 4);
  assert.equal(roundedMonthsBetween("2026-10-27", "2027-02-01"), 3);
  assert.equal(roundedMonthsBetween("2026-11-13", "2027-02-13"), 3);
  assert.equal(roundedMonthsBetween("2027-02-13", "2027-02-13"), 0);
});

test("the recurring total adds only the services of the SAME subscription", () => {
  const totals = recurringTotalsAfterAddition(["330.00"], "330.00");
  assert.equal(totals.currentCents, 33_000);
  assert.equal(totals.futureCents, 66_000);
  // A monthly EC$30 service on a different subscription is never part of this call.
  assert.equal(recurringTotalsAfterAddition(["330.00", "330.00"], "0.00").futureCents, 66_000);
});
