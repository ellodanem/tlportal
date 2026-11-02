import assert from "node:assert/strict";
import test from "node:test";

import {
  currentServiceRate,
  daysUntil,
  resolveServiceActionAvailability,
  scheduledServiceRate,
  type ServiceActionContext,
} from "../lib/domain/canonical-service-presentation";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const rate = (id: string, from: string, until: string | null, amount = "20.00") => ({ id, amount, effectiveFrom: day(from), effectiveUntil: until ? day(until) : null });

// ---- Rate in force ---------------------------------------------------------------------------------

test("the current rate is the one in force today, not simply the newest row", () => {
  const rates = [rate("a", "2026-01-01", "2026-10-16", "15.00"), rate("b", "2026-10-16", "2026-12-01", "20.00"), rate("c", "2026-12-01", null, "25.00")];
  assert.equal(currentServiceRate(rates, day("2026-11-01"))?.id, "b");
  assert.equal(scheduledServiceRate(rates, day("2026-11-01"))?.id, "c");
});

test("rate windows are half-open: a rate ending today is already replaced by the next one", () => {
  const rates = [rate("a", "2026-01-01", "2026-10-16"), rate("b", "2026-10-16", null)];
  assert.equal(currentServiceRate(rates, day("2026-10-15"))?.id, "a");
  assert.equal(currentServiceRate(rates, day("2026-10-16"))?.id, "b");
  assert.equal(scheduledServiceRate(rates, day("2026-10-16")), undefined);
});

test("a service whose rates have all ended still shows its last rate", () => {
  const rates = [rate("a", "2026-01-01", "2026-03-01", "10.00"), rate("b", "2026-03-01", "2026-06-01", "12.00")];
  assert.equal(currentServiceRate(rates, day("2026-11-01"))?.id, "b");
});

test("a service whose only rate has not started yet falls back to that rate rather than showing nothing", () => {
  const rates = [rate("a", "2027-01-01", null)];
  assert.equal(currentServiceRate(rates, day("2026-11-01"))?.id, "a");
  assert.equal(scheduledServiceRate(rates, day("2026-11-01"))?.id, "a");
  assert.equal(currentServiceRate([], day("2026-11-01")), undefined);
});

test("time of day never moves the day a rate changes", () => {
  const rates = [rate("a", "2026-01-01", "2026-10-16"), rate("b", "2026-10-16", null)];
  assert.equal(currentServiceRate(rates, new Date("2026-10-15T23:59:59.999Z"))?.id, "a");
  assert.equal(currentServiceRate(rates, new Date("2026-10-16T00:00:00.000Z"))?.id, "b");
});

test("days until the next renewal count UTC calendar days", () => {
  assert.equal(daysUntil(day("2026-11-16"), new Date("2026-11-01T21:00:00.000Z")), 15);
  assert.equal(daysUntil(day("2026-11-01"), new Date("2026-11-01T23:59:00.000Z")), 0);
  assert.equal(daysUntil(day("2026-10-30"), new Date("2026-11-01T00:00:00.000Z")), -2);
});

// ---- Which operations a service offers ----------------------------------------------------------

const live: ServiceActionContext = {
  canManage: true,
  itemStatus: "active",
  openAssignment: { status: "active" },
  billingEffectiveUntil: null,
  alreadyTransferred: false,
  transferTargetCount: 1,
};

const enabledKeys = (context: ServiceActionContext) =>
  Object.entries(resolveServiceActionAvailability(context)).filter(([, value]) => value.enabled).map(([key]) => key).sort();

test("an active service with a tracker offers every operation except resume", () => {
  assert.deepEqual(enabledKeys(live), ["assetLost", "manageRate", "pause", "replaceTracker", "swapSim", "transfer", "vehicleSold"]);
});

test("a paused service offers resume and rate changes but not a vehicle sale, and explains why", () => {
  const context = { ...live, itemStatus: "paused", openAssignment: { status: "suspended" } };
  const result = resolveServiceActionAvailability(context);
  assert.deepEqual(enabledKeys(context), ["assetLost", "manageRate", "replaceTracker", "resume", "swapSim", "transfer"]);
  assert.match(result.vehicleSold.reason ?? "", /Resume the paused service/);
  assert.match(result.pause.reason ?? "", /already paused/);
});

test("a paused service with a billing end date cannot be resumed and says so", () => {
  const result = resolveServiceActionAvailability({ ...live, itemStatus: "paused", openAssignment: { status: "suspended" }, billingEffectiveUntil: day("2026-12-01") });
  assert.equal(result.resume.enabled, false);
  assert.match(result.resume.reason ?? "", /billing end date/);
});

test("ended and canceled services offer nothing, each with a reason", () => {
  for (const itemStatus of ["ended", "canceled"]) {
    const result = resolveServiceActionAvailability({ ...live, itemStatus });
    for (const [key, availability] of Object.entries(result)) {
      assert.equal(availability.enabled, false, `${itemStatus}: ${key} must be disabled`);
      assert.ok(availability.reason, `${itemStatus}: ${key} must explain itself`);
    }
  }
});

test("read-only subscriptions disable every operation", () => {
  const result = resolveServiceActionAvailability({ ...live, canManage: false });
  assert.deepEqual(enabledKeys({ ...live, canManage: false }), []);
  assert.match(result.manageRate.reason ?? "", /read-only/);
});

test("tracker operations need an open assignment, but rate changes and transfers do not", () => {
  const context = { ...live, openAssignment: null };
  const result = resolveServiceActionAvailability(context);
  assert.deepEqual(enabledKeys(context), ["manageRate", "transfer"]);
  for (const key of ["replaceTracker", "swapSim", "vehicleSold", "assetLost", "pause"] as const) {
    assert.match(result[key].reason ?? "", /No tracker is currently assigned/);
  }
});

test("transfer explains an unavailable destination instead of offering an empty form", () => {
  const none = resolveServiceActionAvailability({ ...live, transferTargetCount: 0 });
  assert.equal(none.transfer.enabled, false);
  assert.match(none.transfer.reason ?? "", /No other active subscription/);
  const done = resolveServiceActionAvailability({ ...live, alreadyTransferred: true });
  assert.equal(done.transfer.enabled, false);
  assert.match(done.transfer.reason ?? "", /already been transferred/);
});
