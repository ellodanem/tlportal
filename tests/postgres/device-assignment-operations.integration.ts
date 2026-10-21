import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../lib/db";
import { createDraftCanonicalSubscription } from "../../lib/services/canonical-subscription-application-service";
import { changeDeviceSim, replaceDeviceForExistingAssignment } from "../../lib/services/device-assignment-operation-service";

after(async () => prisma.$disconnect());

async function fixture(label: string) {
  const customer = await prisma.customer.create({ data: { company: `${label}-${randomUUID()}` } });
  const model = await prisma.deviceModel.create({ data: { name: `${label}-${randomUUID()}`, retailPrice: "100.00" } });
  const sim = await prisma.simCard.create({ data: { iccid: `89${randomUUID().replaceAll("-", "").slice(0, 17)}` } });
  const alternateSim = await prisma.simCard.create({ data: { iccid: `89${randomUUID().replaceAll("-", "").slice(0, 17)}` } });
  const oldDevice = await prisma.device.create({ data: { imei: randomUUID().replaceAll("-", "").slice(0, 15), deviceModelId: model.id, status: "assigned", simCardId: sim.id } });
  const replacement = await prisma.device.create({ data: { imei: randomUUID().replaceAll("-", "").slice(0, 15), deviceModelId: model.id } });
  const assignment = await prisma.serviceAssignment.create({ data: { customerId: customer.id, deviceId: oldDevice.id, simCardId: sim.id, startDate: new Date("2026-10-01T00:00:00.000Z"), nextDueDate: new Date("2026-11-01T00:00:00.000Z"), intervalMonths: 1, invoilessRecurringId: `legacy-${randomUUID()}` } });
  return { customer, sim, alternateSim, oldDevice, replacement, assignment };
}

test("legacy replacement is atomic, auditable, and does not create financial records", async () => {
  const row = await fixture("legacy-replace");
  const before = await Promise.all([
    prisma.invoice.count({ where: { customerId: row.customer.id } }),
    prisma.payment.count({ where: { customerId: row.customer.id } }),
    prisma.recurringInvoiceSchedule.count({ where: { customerId: row.customer.id } }),
    prisma.customerSubscription.count({ where: { customerId: row.customer.id } }),
  ]);
  const result = await replaceDeviceForExistingAssignment({ assignmentId: row.assignment.id, replacementDeviceId: row.replacement.id, effectiveDate: "2026-10-20", simDisposition: "move_current", oldHardwareDisposition: "in_stock", actorUserId: "test-staff", reason: "H9 replacement" });
  const [oldAssignment, newAssignment, oldDevice, newDevice, event, afterCounts] = await Promise.all([
    prisma.serviceAssignment.findUniqueOrThrow({ where: { id: row.assignment.id } }),
    prisma.serviceAssignment.findUniqueOrThrow({ where: { id: result.assignmentId } }),
    prisma.device.findUniqueOrThrow({ where: { id: row.oldDevice.id } }),
    prisma.device.findUniqueOrThrow({ where: { id: row.replacement.id } }),
    prisma.operationalEvent.findFirstOrThrow({ where: { deviceId: row.replacement.id, category: "assignment.hardware_replaced" }, orderBy: { occurredAt: "desc" } }),
    Promise.all([prisma.invoice.count({ where: { customerId: row.customer.id } }), prisma.payment.count({ where: { customerId: row.customer.id } }), prisma.recurringInvoiceSchedule.count({ where: { customerId: row.customer.id } }), prisma.customerSubscription.count({ where: { customerId: row.customer.id } })]),
  ]);
  assert.equal(oldAssignment.status, "cancelled");
  assert.equal(oldAssignment.endDate?.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(newAssignment.invoilessRecurringId, row.assignment.invoilessRecurringId);
  assert.equal(newAssignment.nextDueDate?.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(newAssignment.simCardId, row.sim.id);
  assert.equal(oldDevice.status, "in_stock");
  assert.equal(oldDevice.simCardId, null);
  assert.equal(newDevice.status, "assigned");
  assert.equal(newDevice.simCardId, row.sim.id);
  assert.deepEqual(afterCounts, before);
  assert.match(JSON.stringify(event.payload), /H9 replacement/);
});

test("SIM-only swap records before/after state and cannot change financial records", async () => {
  const row = await fixture("sim-swap");
  const before = await Promise.all([prisma.invoice.count({ where: { customerId: row.customer.id } }), prisma.payment.count({ where: { customerId: row.customer.id } }), prisma.recurringInvoiceSchedule.count({ where: { customerId: row.customer.id } })]);
  await changeDeviceSim({ deviceId: row.oldDevice.id, nextSimCardId: row.alternateSim.id, actorUserId: "test-staff", reason: "provider change" });
  const [device, assignment, event, afterCounts] = await Promise.all([
    prisma.device.findUniqueOrThrow({ where: { id: row.oldDevice.id } }),
    prisma.serviceAssignment.findUniqueOrThrow({ where: { id: row.assignment.id } }),
    prisma.operationalEvent.findFirstOrThrow({ where: { deviceId: row.oldDevice.id, category: "sim.swapped" }, orderBy: { occurredAt: "desc" } }),
    Promise.all([prisma.invoice.count({ where: { customerId: row.customer.id } }), prisma.payment.count({ where: { customerId: row.customer.id } }), prisma.recurringInvoiceSchedule.count({ where: { customerId: row.customer.id } })]),
  ]);
  assert.equal(device.simCardId, row.alternateSim.id);
  assert.equal(assignment.simCardId, row.alternateSim.id);
  assert.deepEqual(afterCounts, before);
  assert.match(JSON.stringify(event.payload), new RegExp(row.sim.id));
  assert.match(JSON.stringify(event.payload), new RegExp(row.alternateSim.id));
});

test("canonical replacement keeps the same billable item and has no billing side effects", async () => {
  const row = await fixture("canonical-replace");
  const subscription = await createDraftCanonicalSubscription({ customerId: row.customer.id, name: "Safe hardware continuity", billingIntervalMonths: 1, collectionMethod: "manual_invoice", currency: "XCD", defaultAgreedAmountPerCycle: "25.00", commercialStartDate: "2026-10-01", billingAnchorDate: "2026-10-01", nextBillingDate: "2026-11-01", items: [{ label: "Vehicle", serviceActivatedDate: "2026-10-01", serviceAssignmentId: row.assignment.id }] });
  const itemId = subscription.items[0].id;
  const before = await Promise.all([prisma.invoice.count({ where: { customerId: row.customer.id } }), prisma.payment.count({ where: { customerId: row.customer.id } }), prisma.recurringInvoiceSchedule.count({ where: { customerId: row.customer.id } })]);
  const result = await replaceDeviceForExistingAssignment({ assignmentId: row.assignment.id, replacementDeviceId: row.replacement.id, effectiveDate: "2026-10-20", simDisposition: "select", replacementSimCardId: row.alternateSim.id, oldHardwareDisposition: "faulty_returned", actorUserId: "test-staff" });
  const [oldAssignment, newAssignment, oldDevice, afterCounts] = await Promise.all([
    prisma.serviceAssignment.findUniqueOrThrow({ where: { id: row.assignment.id } }),
    prisma.serviceAssignment.findUniqueOrThrow({ where: { id: result.assignmentId } }),
    prisma.device.findUniqueOrThrow({ where: { id: row.oldDevice.id } }),
    Promise.all([prisma.invoice.count({ where: { customerId: row.customer.id } }), prisma.payment.count({ where: { customerId: row.customer.id } }), prisma.recurringInvoiceSchedule.count({ where: { customerId: row.customer.id } })]),
  ]);
  assert.equal(oldAssignment.subscriptionItemId, itemId);
  assert.equal(newAssignment.subscriptionItemId, itemId);
  assert.equal(newAssignment.nextDueDate?.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(oldDevice.status, "returned");
  assert.equal(oldDevice.condition, "faulty");
  assert.deepEqual(afterCounts, before);
});
