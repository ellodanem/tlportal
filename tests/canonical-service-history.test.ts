import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServiceHistory,
  type ServiceAuditEvent,
  type ServiceHistoryItem,
} from "../lib/domain/canonical-service-history";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const today = day("2026-11-01");

const device = (label: string, imei: string) => ({ label, imei, deviceModel: { name: "FMB920" } });

function item(overrides: Partial<ServiceHistoryItem> = {}): ServiceHistoryItem {
  return {
    id: "item-1",
    label: "Boat 1",
    status: "active",
    serviceActivatedDate: day("2026-09-16"),
    billingEffectiveFrom: day("2026-09-16"),
    billingEffectiveUntil: null,
    predecessorItemId: null,
    successorItem: null,
    rates: [
      { id: "r1", agreedAmountPerCycle: "25.00", currency: "XCD", billingIntervalMonths: 1, effectiveFrom: day("2026-09-16"), effectiveUntil: day("2026-10-16"), classification: "standard", changeReason: null },
      { id: "r2", agreedAmountPerCycle: "20.00", currency: "XCD", billingIntervalMonths: 1, effectiveFrom: day("2026-10-16"), effectiveUntil: null, classification: "negotiated", changeReason: "Negotiated rate" },
    ],
    serviceAssignments: [
      { id: "a1", startDate: day("2026-09-16"), endDate: null, status: "active", simCard: { iccid: "8989", label: null }, device: device("Boat 1", "862667088433092") },
    ],
    ...overrides,
  };
}

const event = (id: string, category: string, occurredAt: string, payload: unknown, deviceId: string | null = "dev-1"): ServiceAuditEvent => ({ id, category, occurredAt: new Date(occurredAt), deviceId, payload });

test("history lists pricing and assignment records newest first with the mockup's columns", () => {
  const rows = buildServiceHistory({ item: item(), today });
  assert.deepEqual(rows.map((row) => row.event), ["Price updated", "Tracker assigned", "Price set", "Service started"]);
  const updated = rows[0];
  assert.equal(updated.source, "pricing");
  assert.equal(updated.details, "EC$20.00 / month · Negotiated rate");
  const assigned = rows[1];
  assert.equal(assigned.source, "assignment");
  assert.equal(assigned.details, "Boat 1 · 862667088433092 · SIM 8989");
});

test("every pricing record is kept as its own row: nothing is merged or dropped", () => {
  const rows = buildServiceHistory({ item: item(), today });
  assert.equal(rows.filter((row) => row.source === "pricing").length, 2);
  assert.equal(rows.filter((row) => row.source === "assignment").length, 1);
});

test("a future rate is labelled as scheduled and annual cadence uses the billing cycle's unit", () => {
  const rows = buildServiceHistory({
    item: item({
      rates: [
        { id: "r1", agreedAmountPerCycle: "240.00", currency: "XCD", billingIntervalMonths: 12, effectiveFrom: day("2026-01-01"), effectiveUntil: day("2027-01-01"), classification: "standard", changeReason: null },
        { id: "r2", agreedAmountPerCycle: "260.00", currency: "XCD", billingIntervalMonths: 12, effectiveFrom: day("2027-01-01"), effectiveUntil: null, classification: "standard", changeReason: null },
      ],
    }),
    today,
  });
  const scheduled = rows.find((row) => row.id === "rate-r2");
  assert.equal(scheduled?.event, "Price change scheduled");
  assert.match(scheduled?.details ?? "", /\/ year/);
});

test("a USD rate is shown in its own currency", () => {
  const rows = buildServiceHistory({
    item: item({ rates: [{ id: "r1", agreedAmountPerCycle: "30.00", currency: "USD", billingIntervalMonths: 3, effectiveFrom: day("2026-09-16"), effectiveUntil: null, classification: "standard", changeReason: null }] }),
    today,
  });
  const price = rows.find((row) => row.source === "pricing");
  assert.match(price?.details ?? "", /30\.00/);
  assert.match(price?.details ?? "", /\/ quarter/);
  assert.doesNotMatch(price?.details ?? "", /EC\$/);
});

test("a replacement shows the old and new tracker and a later assignment does not repeat 'assigned'", () => {
  const rows = buildServiceHistory({
    item: item({
      serviceAssignments: [
        { id: "a1", startDate: day("2026-09-16"), endDate: day("2026-10-20"), status: "cancelled", device: device("Boat 1", "111") },
        { id: "a2", startDate: day("2026-10-20"), endDate: null, status: "active", device: device("Boat 1 (new)", "222") },
      ],
    }),
    today,
  });
  const events = rows.filter((row) => row.source === "assignment");
  assert.deepEqual(events.map((row) => row.event), ["Tracker replaced", "Tracker assigned"]);
  assert.match(events[0].details, /Boat 1 → Boat 1 \(new\)/);
  assert.ok(!events.some((row) => row.event === "Tracker removed"), "a replaced tracker is not also reported as removed");
});

test("SIM changes come from the audit log and are resolved to identifiers", () => {
  const rows = buildServiceHistory({
    item: item(),
    today,
    simLabels: { old: "SIM 1111", next: "SIM 2222" },
    events: [event("e1", "sim.swapped", "2026-10-25T14:00:00Z", { previousSimId: "old", nextSimId: "next", assignmentId: "a1" })],
  });
  const sim = rows.find((row) => row.event === "SIM changed");
  assert.equal(sim?.details, "SIM 1111 → SIM 2222");
  assert.equal(sim?.source, "audit");
  assert.equal(rows[0].event, "SIM changed", "newest event first");
});

test("pause and resume appear as service events with their reason", () => {
  const rows = buildServiceHistory({
    item: item(),
    today,
    events: [
      event("p1", "subscription.service_paused", "2026-10-20T10:00:00Z", { reason: "seasonal", deviceDisposition: "returned" }),
      event("p2", "subscription.service_resumed", "2026-10-28T10:00:00Z", {}),
    ],
  });
  assert.deepEqual(rows.filter((row) => row.source === "audit").map((row) => row.event), ["Service resumed", "Service paused"]);
  assert.match(rows.find((row) => row.event === "Service paused")?.details ?? "", /Seasonal pause · Tracker returned/);
});

test("a vehicle sale reports billing end and disposition once, without a duplicate 'billing ended' row", () => {
  const rows = buildServiceHistory({
    item: item({ status: "paused", billingEffectiveUntil: day("2026-10-31") }),
    today,
    events: [event("s1", "subscription.vehicle_sold_tracker_removed", "2026-10-30T10:00:00Z", { effectiveUntil: "2026-10-31", deviceDisposition: "in_stock" })],
  });
  const sold = rows.find((row) => row.event === "Vehicle sold, tracker removed");
  assert.equal(sold?.date.toISOString().slice(0, 10), "2026-10-31");
  assert.equal(sold?.details, "Billing ends Oct 31, 2026 · Tracker in stock");
  assert.ok(!rows.some((row) => row.event === "Billing ended" || row.event === "Billing end scheduled"));
});

test("an asset loss is one event naming the reason and the write-off", () => {
  const rows = buildServiceHistory({
    item: item({
      status: "ended",
      billingEffectiveUntil: day("2026-10-31"),
      serviceAssignments: [{ id: "a1", startDate: day("2026-09-16"), endDate: day("2026-10-31"), status: "cancelled", device: device("Boat 1", "111") }],
    }),
    today,
    events: [event("l1", "subscription.asset_lost", "2026-11-01T10:00:00Z", { reason: "sank", lossDate: "2026-10-31" })],
  });
  const loss = rows.find((row) => row.event === "Asset lost");
  assert.equal(loss?.details, "Sank / lost at sea · Billing ended Oct 31, 2026 · Tracker written off");
  assert.ok(!rows.some((row) => row.event === "Tracker removed" || row.event === "Billing ended"));
});

test("without an audit event, a scheduled or elapsed billing end still appears", () => {
  const scheduled = buildServiceHistory({ item: item({ billingEffectiveUntil: day("2026-12-15") }), today });
  assert.equal(scheduled.find((row) => row.id === "lifecycle-end-item-1")?.event, "Billing end scheduled");
  const ended = buildServiceHistory({ item: item({ status: "ended", billingEffectiveUntil: day("2026-10-31") }), today });
  const row = ended.find((entry) => entry.id === "lifecycle-end-item-1");
  assert.equal(row?.event, "Billing ended");
  assert.equal(row?.details, "Service ended");
});

test("transfers are visible on both ends of the chain", () => {
  const out = buildServiceHistory({ item: item({ status: "ended", billingEffectiveUntil: day("2026-10-31"), successorItem: { id: "item-2" } }), today });
  assert.equal(out.find((row) => row.id === "lifecycle-end-item-1")?.event, "Transferred out");
  const inbound = buildServiceHistory({ item: item({ id: "item-2", predecessorItemId: "item-1" }), today });
  assert.equal(inbound.find((row) => row.id === "lifecycle-start-item-2")?.event, "Transferred in");
});

test("a service with no records yields an empty history, not an error", () => {
  const rows = buildServiceHistory({ item: item({ serviceActivatedDate: null, billingEffectiveFrom: null, rates: [], serviceAssignments: [] }), today });
  assert.deepEqual(rows, []);
});

test("unrelated audit categories are ignored, so another feature's events never leak in", () => {
  const rows = buildServiceHistory({ item: item(), today, events: [event("x", "assignment.created", "2026-10-01T00:00:00Z", {})] });
  assert.ok(!rows.some((row) => row.source === "audit"));
});
