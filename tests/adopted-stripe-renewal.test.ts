import assert from "node:assert/strict";
import test from "node:test";

import { decideAdoptedRenewalAdvance, utcDayString } from "../lib/domain/adopted-stripe-renewal";

const base = {
  currentNextBillingDate: "2026-11-05",
  billingIntervalMonths: 1,
  invoicePeriodStart: "2026-11-05",
  invoicePeriodEnd: "2026-12-05",
};

test("a paid renewal covering the current date advances one cycle (the +Venture ATV case)", () => {
  assert.deepEqual(decideAdoptedRenewalAdvance(base), { action: "advance", nextBillingDate: "2026-12-05" });
});

test("applying the same invoice twice never advances twice", () => {
  const first = decideAdoptedRenewalAdvance(base);
  assert.equal(first.action, "advance");
  const second = decideAdoptedRenewalAdvance({ ...base, currentNextBillingDate: "2026-12-05" });
  assert.deepEqual(second, { action: "noop", reason: "already_applied" });
});

test("an older paid invoice replayed later is a no-op", () => {
  const result = decideAdoptedRenewalAdvance({
    ...base,
    invoicePeriodStart: "2026-10-05",
    invoicePeriodEnd: "2026-11-05",
  });
  assert.deepEqual(result, { action: "noop", reason: "already_applied" });
});

test("a later cycle's invoice waits for the earlier one instead of skipping a period", () => {
  const result = decideAdoptedRenewalAdvance({
    ...base,
    invoicePeriodStart: "2026-12-05",
    invoicePeriodEnd: "2027-01-05",
  });
  assert.deepEqual(result, { action: "noop", reason: "later_period" });
});

test("several missed cycles resolve oldest-first, one step at a time", () => {
  let current = "2026-09-05";
  const invoices = [
    ["2026-09-05", "2026-10-05"],
    ["2026-10-05", "2026-11-05"],
    ["2026-11-05", "2026-12-05"],
  ];
  for (const [start, end] of invoices) {
    const decision = decideAdoptedRenewalAdvance({ ...base, currentNextBillingDate: current, invoicePeriodStart: start, invoicePeriodEnd: end });
    assert.equal(decision.action, "advance");
    if (decision.action === "advance") current = decision.nextBillingDate;
  }
  assert.equal(current, "2026-12-05");
});

test("mid-cycle (proration / quantity change) invoices that end on the current renewal change nothing", () => {
  const result = decideAdoptedRenewalAdvance({ ...base, invoicePeriodStart: "2026-11-20", invoicePeriodEnd: "2026-12-05" });
  // Starts well after the current date, so it belongs to a later period.
  assert.equal(result.action, "noop");
});

test("a few hours of Stripe timestamp drift around the renewal day is tolerated", () => {
  const result = decideAdoptedRenewalAdvance({ ...base, invoicePeriodStart: "2026-11-06", invoicePeriodEnd: "2026-12-06" });
  assert.deepEqual(result, { action: "advance", nextBillingDate: "2026-12-06" });
});

test("month-end renewals clamp rather than overshoot", () => {
  const result = decideAdoptedRenewalAdvance({
    currentNextBillingDate: "2027-01-31",
    billingIntervalMonths: 1,
    invoicePeriodStart: "2027-01-31",
    invoicePeriodEnd: "2027-02-28",
  });
  assert.deepEqual(result, { action: "advance", nextBillingDate: "2027-02-28" });
});

test("annual cadence advances a year", () => {
  const result = decideAdoptedRenewalAdvance({
    currentNextBillingDate: "2027-02-13",
    billingIntervalMonths: 12,
    invoicePeriodStart: "2027-02-13",
    invoicePeriodEnd: "2028-02-13",
  });
  assert.deepEqual(result, { action: "advance", nextBillingDate: "2028-02-13" });
});

test("a payment that would jump more than one cycle goes to review, not an automatic leap", () => {
  const result = decideAdoptedRenewalAdvance({ ...base, invoicePeriodEnd: "2027-02-05" });
  assert.equal(result.action, "review");
});

test("missing or inconsistent data goes to review instead of guessing", () => {
  assert.equal(decideAdoptedRenewalAdvance({ ...base, currentNextBillingDate: null }).action, "review");
  assert.equal(decideAdoptedRenewalAdvance({ ...base, billingIntervalMonths: null }).action, "review");
  assert.equal(decideAdoptedRenewalAdvance({ ...base, invoicePeriodStart: null }).action, "review");
  assert.equal(decideAdoptedRenewalAdvance({ ...base, invoicePeriodEnd: null }).action, "review");
  assert.equal(decideAdoptedRenewalAdvance({ ...base, invoicePeriodStart: "2026-12-05", invoicePeriodEnd: "2026-11-05" }).action, "review");
});

test("utcDayString uses the UTC calendar day", () => {
  assert.equal(utcDayString(new Date("2026-12-05T19:09:19.000Z")), "2026-12-05");
  assert.equal(utcDayString(null), null);
});
