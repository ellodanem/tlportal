import assert from "node:assert/strict";
import test from "node:test";

import { assetLossNote } from "../lib/domain/asset-loss";
import {
  countBillableServices,
  endedServiceReason,
  isServiceBillingEnded,
  partitionServicesByBilling,
} from "../lib/domain/canonical-service-lifecycle";

const now = new Date("2026-11-01T12:00:00.000Z");
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test("a service whose billing end date has passed is ended even though its status is still active", () => {
  assert.equal(isServiceBillingEnded({ status: "active", billingEffectiveUntil: day("2026-10-27") }, now), true);
});

test("the end date is the first day not billed, so an end date of today is already ended", () => {
  assert.equal(isServiceBillingEnded({ status: "active", billingEffectiveUntil: day("2026-11-01") }, now), true);
  assert.equal(isServiceBillingEnded({ status: "active", billingEffectiveUntil: day("2026-11-02") }, now), false);
});

test("open-ended, paused and future-ended services stay billable; closed statuses are ended", () => {
  assert.equal(isServiceBillingEnded({ status: "active", billingEffectiveUntil: null }, now), false);
  assert.equal(isServiceBillingEnded({ status: "paused", billingEffectiveUntil: null }, now), false);
  assert.equal(isServiceBillingEnded({ status: "active", billingEffectiveUntil: day("2026-12-01") }, now), false);
  assert.equal(isServiceBillingEnded({ status: "ended", billingEffectiveUntil: null }, now), true);
  assert.equal(isServiceBillingEnded({ status: "canceled", billingEffectiveUntil: null }, now), true);
});

test("partition and count agree: only the Vitz is billable when the boat has ended", () => {
  const vitz = { id: "vitz", status: "active", billingEffectiveUntil: null };
  const boat = { id: "boat", status: "active", billingEffectiveUntil: day("2026-10-27") };
  const { current, ended } = partitionServicesByBilling([vitz, boat], now);
  assert.deepEqual(current.map((i) => i.id), ["vitz"]);
  assert.deepEqual(ended.map((i) => i.id), ["boat"]);
  assert.equal(countBillableServices([vitz, boat], now), 1);
});

test("the ended reason is read from the loss and vehicle-sale notes", () => {
  const lost = { serviceAssignments: [{ notes: assetLossNote({ reason: "sank", lossDate: "2026-10-27" }), pauseNote: null }] };
  const sold = { serviceAssignments: [{ notes: null, pauseNote: "Vehicle sold; tracker removal." }] };
  const plain = { serviceAssignments: [{ notes: "Installed at office", pauseNote: null }] };
  assert.equal(endedServiceReason(lost), "asset_lost");
  assert.equal(endedServiceReason(sold), "vehicle_sold");
  assert.equal(endedServiceReason(plain), "ended");
  assert.equal(endedServiceReason({ serviceAssignments: [] }), "ended");
});
