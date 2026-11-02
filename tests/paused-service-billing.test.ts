import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { billsOnDate, serviceStatusLabel } from "../components/admin/canonical-subscription/format";
import { CanonicalNativeBillingError, resolveCanonicalBillingCycle } from "../lib/domain/canonical-native-billing";
import { billableServiceCountAtRenewal } from "../lib/domain/canonical-stripe-quantity-check";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

type ItemStatus = "draft" | "pending_activation" | "active" | "paused" | "ended" | "canceled";

function service(id: string, status: ItemStatus) {
  return {
    id,
    label: id,
    status,
    billingEffectiveFrom: day("2026-01-01"),
    billingEffectiveUntil: null,
    rates: [{
      id: `rate-${id}`,
      billingIntervalMonths: 1,
      agreedAmountPerCycle: new Prisma.Decimal("25.00"),
      currency: "XCD",
      effectiveFrom: day("2026-01-01"),
      effectiveUntil: null,
      classification: "standard" as const,
    }],
  };
}

const configuration = (items: ReturnType<typeof service>[]) => ({
  lifecycleStatus: "active" as const,
  billingIntervalMonths: 1,
  currency: "XCD",
  items,
});

test("a paused service drops out of the next renewal, with or without the planning option", () => {
  const items = [service("a", "active"), service("b", "active"), service("c", "paused")];
  for (const options of [undefined, { requireActive: false }]) {
    const cycle = resolveCanonicalBillingCycle(configuration(items), day("2026-11-15"), options);
    assert.equal(cycle.subtotal.toFixed(2), "50.00");
    assert.equal(cycle.lines.length, 2);
  }
});

test("planning still counts services that are not activated yet", () => {
  const cycle = resolveCanonicalBillingCycle(
    { ...configuration([service("a", "pending_activation"), service("b", "paused")]), lifecycleStatus: "draft" as const },
    day("2026-11-15"),
    { requireActive: false },
  );
  assert.equal(cycle.subtotal.toFixed(2), "25.00");
});

test("a subscription whose services are all paused has nothing billable", () => {
  assert.throws(
    () => resolveCanonicalBillingCycle(configuration([service("a", "paused")]), day("2026-11-15"), { requireActive: false }),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError && caught.code === "NO_BILLABLE_ITEMS",
  );
});

test("the expected Stripe quantity and the on-screen counts skip paused services like the total does", () => {
  const items = [service("a", "active"), service("b", "paused"), service("c", "active")];
  const renewal = day("2026-11-15");
  assert.equal(billableServiceCountAtRenewal(items, renewal), 2);
  assert.equal(items.filter((item) => billsOnDate(item, renewal)).length, 2);
  assert.deepEqual(serviceStatusLabel(service("b", "paused")), { label: "paused · not billed", tone: "warning" });
});

test("pausing a subscription service is one transaction with the tracker, only for a billing service", async () => {
  const source = await read("lib/services/service-pause-service.ts");
  const pause = source.slice(source.indexOf("export async function pauseServiceAssignment"), source.indexOf("export async function resumeServiceAssignment"));
  const resume = source.slice(source.indexOf("export async function resumeServiceAssignment"));

  assert.match(pause, /input\.pauseSubscriptionItem/);
  assert.match(pause, /tx\.subscriptionItem\.updateMany\(\{\s*where: \{ id: assignment\.subscriptionItemId, status: "active" \},\s*data: \{ status: "paused" \}/);
  assert.match(resume, /input\.resumeSubscriptionItem/);
  assert.match(resume, /tx\.subscriptionItem\.updateMany\(\{\s*where: \{ id: assignment\.subscriptionItemId, status: "paused" \},\s*data: \{ status: "active" \}/);
  // Both updates run inside the transaction callback that updates the assignment.
  assert.ok(pause.indexOf("$transaction") < pause.indexOf("tx.subscriptionItem.updateMany"));
  assert.ok(resume.indexOf("$transaction") < resume.indexOf("tx.subscriptionItem.updateMany"));
});

test("only the plain pause and resume actions change the service; sale and loss flows keep billing by date", async () => {
  const actions = await read("app/admin/subscriptions/canonical/actions.ts");
  const body = (name: string) => {
    const start = actions.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const next = actions.indexOf("\nexport async function ", start + 1);
    return actions.slice(start, next === -1 ? undefined : next);
  };

  assert.match(body("pauseCanonicalServiceAssignmentAction"), /pauseSubscriptionItem: true/);
  assert.match(body("resumeCanonicalServiceAssignmentAction"), /resumeSubscriptionItem: true/);
  assert.doesNotMatch(body("removeCanonicalServiceForVehicleSaleAction"), /pauseSubscriptionItem/);
  assert.doesNotMatch(body("recordCanonicalAssetLossAction"), /pauseSubscriptionItem/);
  // A sold, lost or scheduled-to-end service stops billing by date; resuming the tracker must not undo that.
  assert.match(body("resumeCanonicalServiceAssignmentAction"), /item\.billingEffectiveUntil/);
});

test("the add-service preview and the reconciliation totals leave paused services out", async () => {
  const addition = await read("lib/services/subscription-service-addition-service.ts");
  assert.match(addition, /notIn: \["ended", "canceled", "paused"\]/);
  assert.match(addition, /item\.status !== "paused"/);
  const reconciliation = await read("lib/domain/customer-subscription-reconciliation.ts");
  assert.match(reconciliation, /\["ended", "canceled", "paused"\]\.includes\(item\.status\)/);
});
