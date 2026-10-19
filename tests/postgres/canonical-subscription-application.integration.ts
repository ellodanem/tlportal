import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/db";
import {
  CanonicalSubscriptionValidationError,
  sumExactCycleAmounts,
} from "../../lib/domain/canonical-subscription-application";
import {
  addBillableServiceToSubscription,
  createDraftCanonicalSubscription,
  deleteUnbilledDraftSubscriptionItem,
  getCanonicalSubscriptionById,
  getSubscriptionItemsWithEffectiveRates,
  listActiveCanonicalSubscriptions,
  listCanonicalSubscriptionsForCustomer,
  previewAnnualSubscriptionAddition,
  replaceSubscriptionItemHardware,
  scheduleSubscriptionItemEnd,
  scheduleSubscriptionItemRate,
  transferSubscriptionItem,
  transitionCanonicalSubscriptionLifecycle,
} from "../../lib/services/canonical-subscription-application-service";
import { activateCanonicalManualSubscription } from "../../lib/services/canonical-subscription-activation-service";

after(async () => {
  await prisma.$disconnect();
});

async function createCustomer(label: string) {
  return prisma.customer.create({
    data: { company: `${label}-${randomUUID()}` },
  });
}

async function createStaff(label: string) {
  return prisma.user.create({
    data: {
      email: `${label}-${randomUUID()}@example.test`,
      passwordHash: "test-only-password-hash",
    },
  });
}

async function createAssignment(customerId: string, label: string) {
  const deviceModel = await prisma.deviceModel.create({
    data: {
      name: `${label}-${randomUUID()}`,
      retailPrice: "100.00",
    },
  });
  const device = await prisma.device.create({
    data: {
      imei: randomUUID().replaceAll("-", "").slice(0, 15),
      deviceModelId: deviceModel.id,
    },
  });
  return prisma.serviceAssignment.create({
    data: {
      customerId,
      deviceId: device.id,
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      status: "active",
    },
  });
}

async function createMonthlySubscription(
  customerId: string,
  label: string,
  items: Parameters<typeof createDraftCanonicalSubscription>[0]["items"] = [],
) {
  return createDraftCanonicalSubscription({
    customerId,
    name: label,
    reference: `${label}-${randomUUID()}`,
    billingIntervalMonths: 1,
    collectionMethod: "manual_invoice",
    currency: "XCD",
    defaultAgreedAmountPerCycle: "25.00",
    commercialStartDate: "2026-01-01",
    billingAnchorDate: "2026-01-01",
    nextBillingDate: "2026-11-01",
    items,
  });
}

function expectValidationCode(code: string) {
  return (error: unknown) => error instanceof CanonicalSubscriptionValidationError
    && error.code === code;
}

test("a customer with no subscriptions returns an empty collection", async () => {
  const customer = await createCustomer("no-subscriptions");
  assert.deepEqual(await listCanonicalSubscriptionsForCustomer(customer.id), []);
});

test("monthly, annual, and same-frequency subscriptions remain independently identifiable", async () => {
  const customer = await createCustomer("independent-subscriptions");
  const monthlyA = await createMonthlySubscription(customer.id, "Monthly A");
  const monthlyB = await createMonthlySubscription(customer.id, "Monthly B");
  const annual = await createDraftCanonicalSubscription({
    customerId: customer.id,
    name: "Annual",
    billingIntervalMonths: 12,
    collectionMethod: "stripe_autocharge",
    currency: "XCD",
    defaultAgreedAmountPerCycle: "275.00",
    commercialStartDate: "2026-01-01",
    billingAnchorDate: "2026-01-01",
    nextBillingDate: "2027-01-01",
  });

  const subscriptions = await listCanonicalSubscriptionsForCustomer(customer.id);
  assert.equal(subscriptions.length, 3);
  assert.equal(new Set(subscriptions.map((subscription) => subscription.id)).size, 3);
  assert.equal(monthlyA.billingIntervalMonths, 1);
  assert.equal(monthlyB.billingIntervalMonths, 1);
  assert.equal(annual.billingIntervalMonths, 12);
});

test("multiple standard and negotiated item rates total EC$70", async () => {
  const customer = await createCustomer("rate-total");
  const subscription = await createMonthlySubscription(customer.id, "Fleet 70", [
    { label: "Vehicle A", serviceActivatedDate: "2026-10-01" },
    { label: "Vehicle B", serviceActivatedDate: "2026-10-01" },
    {
      label: "Vehicle C",
      serviceActivatedDate: "2026-10-01",
      agreedAmountPerCycle: "20.00",
      rateClassification: "negotiated",
    },
  ]);

  const items = await getSubscriptionItemsWithEffectiveRates(subscription.id, "2026-10-15");
  assert.equal(items.length, 3);
  assert.equal(
    sumExactCycleAmounts(items.map((item) => item.rates[0].agreedAmountPerCycle)).toFixed(2),
    "70.00",
  );
  assert.deepEqual(
    items.map((item) => item.rates[0].classification),
    ["standard", "standard", "negotiated"],
  );
});

test("explicit annual EC$275 remains the authoritative per-item cycle amount", async () => {
  const customer = await createCustomer("annual-price");
  const subscription = await createDraftCanonicalSubscription({
    customerId: customer.id,
    name: "Annual EC275",
    billingIntervalMonths: 12,
    collectionMethod: "manual_invoice",
    currency: "XCD",
    defaultAgreedAmountPerCycle: "275.00",
    commercialStartDate: "2026-01-01",
    billingAnchorDate: "2026-01-01",
    nextBillingDate: "2027-01-01",
    items: [{ label: "Annual vehicle", serviceActivatedDate: "2026-04-01" }],
  });

  assert.equal(subscription.agreedAmountPerCycle?.toFixed(2), "275.00");
  assert.equal(subscription.items[0].rates[0].agreedAmountPerCycle.toFixed(2), "275.00");
  assert.equal(subscription.items[0].billingEffectiveFrom?.toISOString().slice(0, 10), "2027-01-01");
  const preview = await previewAnnualSubscriptionAddition({
    subscriptionId: subscription.id,
    annualPeriodStart: "2026-01-01",
    annualPeriodEnd: "2027-01-01",
    serviceActivatedDate: "2026-04-01",
  });
  assert.equal(preview.proratedAmount.toFixed(2), "207.19");
  assert.equal(preview.futureRecurringEffectiveDate, "2027-01-01");
});

test("monthly mid-cycle additions become recurring at the existing next renewal", async () => {
  const customer = await createCustomer("monthly-addition");
  const subscription = await createMonthlySubscription(customer.id, "Monthly additions");
  const itemId = await addBillableServiceToSubscription(subscription.id, {
    label: "Added October 15",
    serviceActivatedDate: "2026-10-15",
  });
  const item = await prisma.subscriptionItem.findUniqueOrThrow({ where: { id: itemId } });
  assert.equal(item.serviceActivatedDate?.toISOString().slice(0, 10), "2026-10-15");
  assert.equal(item.billingEffectiveFrom?.toISOString().slice(0, 10), "2026-11-01");
});

test("rate changes preserve the prior period and overlapping backdated changes are rejected", async () => {
  const customer = await createCustomer("rate-history");
  const subscription = await createMonthlySubscription(customer.id, "Rate history", [
    { label: "Vehicle", serviceActivatedDate: "2026-01-01", billingEffectiveFrom: "2026-01-01" },
  ]);
  const itemId = subscription.items[0].id;

  await scheduleSubscriptionItemRate({
    subscriptionItemId: itemId,
    agreedAmountPerCycle: "20.00",
    effectiveFrom: "2026-06-01",
    classification: "negotiated",
    changeReason: "Agreed retention price",
  });
  const rates = await prisma.subscriptionItemRate.findMany({
    where: { subscriptionItemId: itemId },
    orderBy: { effectiveFrom: "asc" },
  });
  assert.equal(rates.length, 2);
  assert.equal(rates[0].effectiveUntil?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(rates[1].agreedAmountPerCycle.toFixed(2), "20.00");

  await assert.rejects(
    scheduleSubscriptionItemRate({
      subscriptionItemId: itemId,
      agreedAmountPerCycle: "22.00",
      effectiveFrom: "2026-03-01",
      effectiveUntil: "2026-07-01",
    }),
    /cannot overlap/,
  );
  assert.equal(
    await prisma.subscriptionItemRate.count({ where: { subscriptionItemId: itemId } }),
    2,
  );
});

test("scheduling an item end closes its open rate without deleting history", async () => {
  const customer = await createCustomer("scheduled-end");
  const subscription = await createMonthlySubscription(customer.id, "Scheduled end", [
    { label: "Ending vehicle", serviceActivatedDate: "2026-10-01" },
  ]);
  const itemId = subscription.items[0].id;

  await scheduleSubscriptionItemEnd({
    subscriptionItemId: itemId,
    effectiveUntil: "2026-12-01",
  });
  const item = await prisma.subscriptionItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rates: true },
  });
  assert.equal(item.billingEffectiveUntil?.toISOString().slice(0, 10), "2026-12-01");
  assert.equal(item.rates.length, 1);
  assert.equal(item.rates[0].effectiveUntil?.toISOString().slice(0, 10), "2026-12-01");
});

test("hardware replacement keeps one commercial item and both assignment records", async () => {
  const customer = await createCustomer("hardware-replacement");
  const original = await createAssignment(customer.id, "original-device");
  const replacement = await createAssignment(customer.id, "replacement-device");
  const subscription = await createMonthlySubscription(customer.id, "Hardware continuity", [
    {
      label: "Vehicle 001",
      serviceActivatedDate: "2026-10-01",
      serviceAssignmentId: original.id,
    },
  ]);
  const itemId = subscription.items[0].id;

  await replaceSubscriptionItemHardware({
    subscriptionItemId: itemId,
    replacementAssignmentId: replacement.id,
    replacedOn: "2026-10-20",
  });
  const assignments = await prisma.serviceAssignment.findMany({
    where: { subscriptionItemId: itemId },
  });
  assert.equal(assignments.length, 2);
  assert.equal(
    assignments.find((assignment) => assignment.id === original.id)?.endDate?.toISOString().slice(0, 10),
    "2026-10-20",
  );
  assert.equal(
    assignments.find((assignment) => assignment.id === replacement.id)?.subscriptionItemId,
    itemId,
  );
  assert.equal(await prisma.subscriptionItem.count({ where: { id: itemId } }), 1);
});

test("item transfer creates a successor and preserves predecessor ownership and rates", async () => {
  const customer = await createCustomer("item-transfer");
  const sourceSubscription = await createMonthlySubscription(customer.id, "Transfer source", [
    { label: "Vehicle T", serviceActivatedDate: "2026-10-01", billingEffectiveFrom: "2026-10-01" },
  ]);
  const targetSubscription = await createMonthlySubscription(customer.id, "Transfer target");
  const sourceItemId = sourceSubscription.items[0].id;

  const successorId = await transferSubscriptionItem({
    sourceSubscriptionItemId: sourceItemId,
    targetSubscriptionId: targetSubscription.id,
    transferDate: "2026-10-20",
    agreedAmountPerCycle: "20.00",
    changeReason: "Moved to negotiated fleet agreement",
  });
  const [source, successor] = await Promise.all([
    prisma.subscriptionItem.findUniqueOrThrow({
      where: { id: sourceItemId },
      include: { rates: true },
    }),
    prisma.subscriptionItem.findUniqueOrThrow({
      where: { id: successorId },
      include: { rates: true },
    }),
  ]);
  assert.equal(source.status, "ended");
  assert.equal(source.billingEffectiveUntil?.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(source.rates[0].effectiveUntil?.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(successor.predecessorItemId, source.id);
  assert.equal(successor.customerSubscriptionId, targetSubscription.id);
  assert.equal(successor.rates[0].agreedAmountPerCycle.toFixed(2), "20.00");
});

test("cross-customer assignments are rejected without creating an item", async () => {
  const customer = await createCustomer("assignment-owner");
  const otherCustomer = await createCustomer("assignment-other");
  const foreignAssignment = await createAssignment(otherCustomer.id, "foreign-device");
  const subscription = await createMonthlySubscription(customer.id, "Assignment ownership");

  await assert.rejects(
    addBillableServiceToSubscription(subscription.id, {
      label: "Invalid foreign assignment",
      serviceActivatedDate: "2026-10-01",
      serviceAssignmentId: foreignAssignment.id,
    }),
    expectValidationCode("CROSS_CUSTOMER_ASSIGNMENT"),
  );
  assert.equal(
    await prisma.subscriptionItem.count({ where: { customerSubscriptionId: subscription.id } }),
    0,
  );
});

test("lifecycle validation permits shadow activation but rejects invalid backwards moves", async () => {
  const customer = await createCustomer("lifecycle");
  const subscription = await createMonthlySubscription(customer.id, "Lifecycle", [
    { label: "Ready vehicle", serviceActivatedDate: "2026-10-01" },
  ]);
  await transitionCanonicalSubscriptionLifecycle(subscription.id, "pending_activation");
  await transitionCanonicalSubscriptionLifecycle(subscription.id, "active");
  assert.equal((await getCanonicalSubscriptionById(subscription.id)).lifecycleStatus, "active");
  assert.ok((await listActiveCanonicalSubscriptions(customer.id)).some((row) => row.id === subscription.id));
  await assert.rejects(
    transitionCanonicalSubscriptionLifecycle(subscription.id, "draft"),
    expectValidationCode("INVALID_LIFECYCLE_TRANSITION"),
  );
});

test("failed nested creation rolls back the subscription and earlier items", async () => {
  const customer = await createCustomer("rollback-owner");
  const otherCustomer = await createCustomer("rollback-other");
  const foreignAssignment = await createAssignment(otherCustomer.id, "rollback-foreign");
  const reference = `rollback-${randomUUID()}`;

  await assert.rejects(
    createDraftCanonicalSubscription({
      customerId: customer.id,
      name: "Must roll back",
      reference,
      billingIntervalMonths: 1,
      collectionMethod: "manual_invoice",
      currency: "XCD",
      defaultAgreedAmountPerCycle: "25.00",
      commercialStartDate: "2026-01-01",
      billingAnchorDate: "2026-01-01",
      nextBillingDate: "2026-11-01",
      items: [
        { label: "Created before failure", serviceActivatedDate: "2026-10-01" },
        {
          label: "Triggers failure",
          serviceActivatedDate: "2026-10-01",
          serviceAssignmentId: foreignAssignment.id,
        },
      ],
    }),
    expectValidationCode("CROSS_CUSTOMER_ASSIGNMENT"),
  );

  assert.equal(await prisma.customerSubscription.count({ where: { reference } }), 0);
  assert.equal(
    (await prisma.serviceAssignment.findUniqueOrThrow({ where: { id: foreignAssignment.id } }))
      .subscriptionItemId,
    null,
  );
});

test("canonical creation has no Stripe, recurring schedule, invoice, or billing-operation side effects", async () => {
  const customer = await createCustomer("no-side-effects");
  const subscription = await createMonthlySubscription(customer.id, "No side effects", [
    { label: "Shadow service", serviceActivatedDate: "2026-10-01" },
  ]);

  const [providerLinks, schedules, invoices, operations] = await Promise.all([
    prisma.subscriptionProviderLink.count({ where: { customerSubscriptionId: subscription.id } }),
    prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: subscription.id } }),
    prisma.invoice.count({ where: { customerSubscriptionId: subscription.id } }),
    prisma.billingOperation.count({ where: { customerSubscriptionId: subscription.id } }),
  ]);
  assert.deepEqual([providerLinks, schedules, invoices, operations], [0, 0, 0, 0]);
  assert.equal(subscription.controlMode, "shadow");
  assert.equal(subscription.stripeSubscriptionId, null);
});

test("legacy subscriptions remain unchanged and reject Phase 1B mutations", async () => {
  const customer = await createCustomer("legacy-unchanged");
  const legacy = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      planTermMonths: 3,
      monthlyRateXcd: "25.00",
      vehicleCount: 4,
      status: "active",
    },
  });

  await listCanonicalSubscriptionsForCustomer(customer.id);
  await assert.rejects(
    addBillableServiceToSubscription(legacy.id, {
      label: "Must not attach",
      serviceActivatedDate: "2026-10-01",
    }),
    expectValidationCode("SUBSCRIPTION_NOT_EDITABLE"),
  );
  const unchanged = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(unchanged.controlMode, "legacy");
  assert.equal(unchanged.planTermMonths, 3);
  assert.equal(unchanged.monthlyRateXcd?.toFixed(2), "25.00");
  assert.equal(unchanged.vehicleCount, 4);
  assert.equal(unchanged.lifecycleStatus, null);
});

test("items with financial history cannot be hard-deleted", async () => {
  const customer = await createCustomer("financial-history");
  const subscription = await createMonthlySubscription(customer.id, "Financial history", [
    { label: "Billed service", serviceActivatedDate: "2026-10-01" },
  ]);
  const item = subscription.items[0];
  const invoice = await prisma.invoice.create({
    data: {
      customerId: customer.id,
      customerSubscriptionId: subscription.id,
      currency: "XCD",
      total: "25.00",
      amountDue: "25.00",
    },
  });
  await prisma.invoiceServiceSnapshot.create({
    data: {
      invoiceId: invoice.id,
      subscriptionItemId: item.id,
      subscriptionItemRateId: item.rates[0].id,
      serviceLabelSnapshot: item.label,
      agreedAmountPerCycleSnapshot: "25.00",
      billedAmount: "25.00",
      currency: "XCD",
    },
  });

  await assert.rejects(
    deleteUnbilledDraftSubscriptionItem(item.id),
    expectValidationCode("ITEM_HAS_FINANCIAL_HISTORY"),
  );
  assert.equal(await prisma.subscriptionItem.count({ where: { id: item.id } }), 1);
});

test("service uses exact Decimal values rather than floating point reconstruction", async () => {
  const customer = await createCustomer("decimal-values");
  const subscription = await createMonthlySubscription(customer.id, "Decimal values", [
    { label: "Exact service", serviceActivatedDate: "2026-10-01", agreedAmountPerCycle: new Prisma.Decimal("20.00") },
  ]);
  assert.equal(subscription.items[0].rates[0].agreedAmountPerCycle.toFixed(2), "20.00");
});

test("canonical lifecycle pauses, resumes, and closes only its own recurring schedule", async () => {
  const customer = await createCustomer("lifecycle-schedule");
  const subscription = await createMonthlySubscription(customer.id, "Lifecycle schedule", [
    { label: "Tracked vehicle", serviceActivatedDate: "2026-10-01" },
  ]);
  const schedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      customerSubscriptionId: subscription.id,
      name: "Canonical lifecycle test",
      intervalMonths: 1,
      nextIssueDate: new Date("2026-11-01T00:00:00.000Z"),
      autoEmail: false,
    },
  });

  await transitionCanonicalSubscriptionLifecycle(subscription.id, "pending_activation");
  await transitionCanonicalSubscriptionLifecycle(subscription.id, "active");
  await transitionCanonicalSubscriptionLifecycle(subscription.id, "paused");
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status, "paused");

  await transitionCanonicalSubscriptionLifecycle(subscription.id, "active");
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status, "active");

  await transitionCanonicalSubscriptionLifecycle(subscription.id, "ended");
  const [storedSchedule, item] = await Promise.all([
    prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: schedule.id } }),
    prisma.subscriptionItem.findFirstOrThrow({ where: { customerSubscriptionId: subscription.id } }),
  ]);
  assert.equal(storedSchedule.status, "ended");
  assert.equal(item.status, "ended");
  assert.ok(item.endedAt);
});

test("manual canonical activation creates one future schedule without issuing or delivering an invoice", async () => {
  const customer = await createCustomer("manual-activation");
  const staff = await createStaff("manual-activation");
  const subscription = await createMonthlySubscription(customer.id, "Manual activation", [
    { label: "Ready service", serviceActivatedDate: "2026-10-01" },
  ]);
  await prisma.customerSubscription.update({ where: { id: subscription.id }, data: { controlMode: "canonical" } });
  const environment = { NODE_ENV: "test", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" };
  const input = { subscriptionId: subscription.id, staffUserId: staff.id, confirmationNote: "Deferred billing agreed during installation.", environment };
  const first = await activateCanonicalManualSubscription(input);
  const second = await activateCanonicalManualSubscription(input);
  assert.equal(second.reused, true);
  assert.equal(second.scheduleId, first.scheduleId);
  const [active, schedule, invoices] = await Promise.all([
    prisma.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id }, include: { items: true } }),
    prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: first.scheduleId }, include: { lineItems: true } }),
    prisma.invoice.count({ where: { customerSubscriptionId: subscription.id } }),
  ]);
  assert.equal(active.lifecycleStatus, "active");
  assert.equal(active.items[0].status, "active");
  assert.equal(schedule.nextIssueDate.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(schedule.autoEmail, false);
  assert.equal(schedule.lineItems.length, 1);
  assert.equal(invoices, 0);
  assert.equal(await prisma.canonicalSubscriptionOperationalActivation.count({ where: { customerSubscriptionId: subscription.id } }), 1);
});

test("a migration shadow becomes canonical while ending the old manual schedule without billing", async () => {
  const customer = await createCustomer("automatic-manual-migration");
  const staff = await createStaff("automatic-manual-migration");
  const subscription = await createMonthlySubscription(customer.id, "Automatic migration", [
    { label: "Mapped service", serviceActivatedDate: "2026-10-01" },
  ]);
  await prisma.customerSubscription.update({ where: { id: subscription.id }, data: { controlMode: "shadow" } });
  const legacySchedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      name: "Legacy manual authority",
      intervalMonths: 1,
      nextIssueDate: new Date("2026-11-01T00:00:00.000Z"),
      autoEmail: true,
    },
  });

  const result = await activateCanonicalManualSubscription({
    subscriptionId: subscription.id,
    staffUserId: staff.id,
    confirmationNote: "Automatic canonical migration retained the legacy financial history.",
    initialBilling: { mode: "deferred" },
    promoteMigrationShadow: true,
    legacyScheduleId: legacySchedule.id,
    environment: { NODE_ENV: "test", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" },
  });

  const [canonical, oldSchedule, newSchedule, invoices] = await Promise.all([
    prisma.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } }),
    prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: legacySchedule.id } }),
    prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: result.scheduleId } }),
    prisma.invoice.count({ where: { customerId: customer.id } }),
  ]);
  assert.equal(canonical.controlMode, "canonical");
  assert.equal(canonical.lifecycleStatus, "active");
  assert.equal(oldSchedule.status, "ended");
  assert.equal(newSchedule.status, "active");
  assert.equal(newSchedule.autoEmail, false);
  assert.equal(invoices, 0);
});

test("an invoice-backed migration shadow without a legacy schedule can promote future authority without billing", async () => {
  const customer = await createCustomer("invoice-backed-migration");
  const staff = await createStaff("invoice-backed-migration");
  const subscription = await createMonthlySubscription(customer.id, "Invoice-backed migration", [
    { label: "Mapped service", serviceActivatedDate: "2026-10-01" },
  ]);
  await prisma.customerSubscription.update({ where: { id: subscription.id }, data: { controlMode: "shadow" } });

  const result = await activateCanonicalManualSubscription({
    subscriptionId: subscription.id,
    staffUserId: staff.id,
    confirmationNote: "The existing invoice covers the current period; canonical billing starts at the next renewal.",
    initialBilling: { mode: "deferred" },
    promoteMigrationShadow: true,
    environment: {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED: "true",
    },
  });

  const [canonical, schedule, invoices] = await Promise.all([
    prisma.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } }),
    prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: result.scheduleId } }),
    prisma.invoice.count({ where: { customerId: customer.id } }),
  ]);
  assert.equal(canonical.controlMode, "canonical");
  assert.equal(canonical.lifecycleStatus, "active");
  assert.equal(schedule.status, "active");
  assert.equal(schedule.autoEmail, false);
  assert.equal(invoices, 0);
});

test("staff activation issues one initial invoice with exact service snapshots and one-time charges", async () => {
  const customer = await createCustomer("initial-invoice");
  const staff = await createStaff("initial-invoice");
  const subscription = await createDraftCanonicalSubscription({
    customerId: customer.id,
    name: "Initial invoice agreement",
    billingIntervalMonths: 1,
    collectionMethod: "manual_invoice",
    currency: "XCD",
    defaultAgreedAmountPerCycle: "25.00",
    commercialStartDate: "2026-10-01",
    billingAnchorDate: "2026-10-01",
    nextBillingDate: "2026-11-01",
    controlMode: "canonical",
    items: [
      { label: "Vehicle A", serviceActivatedDate: "2026-10-01", billingEffectiveFrom: "2026-10-01" },
      { label: "Vehicle B", serviceActivatedDate: "2026-10-01", billingEffectiveFrom: "2026-10-01", agreedAmountPerCycle: "20.00", rateClassification: "negotiated" },
    ],
  });
  const input = {
    subscriptionId: subscription.id,
    staffUserId: staff.id,
    confirmationNote: "Installation and one-month advance billing confirmed.",
    environment: { NODE_ENV: "test", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" },
    initialBilling: {
      mode: "advance_invoice" as const,
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-01T00:00:00.000Z"),
      issueDate: new Date("2026-10-01T00:00:00.000Z"),
      dueDaysAfterIssue: 7,
      oneTimeCharges: [{ description: "GPS installation", quantity: 2, unitPrice: 80 }],
    },
  };
  const results = await Promise.all(Array.from({ length: 4 }, () => activateCanonicalManualSubscription(input)));
  assert.equal(results.filter((result) => !result.reused).length, 1);
  const activation = await prisma.canonicalSubscriptionOperationalActivation.findUniqueOrThrow({
    where: { customerSubscriptionId: subscription.id },
    include: { initialInvoice: { include: { lineItems: true, serviceSnapshots: true } } },
  });
  assert.equal(activation.initialBillingMode, "advance_invoice");
  assert.equal(activation.initialPeriodStart?.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(activation.initialPeriodEnd?.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(activation.initialInvoice?.status, "open");
  assert.equal(activation.initialInvoice?.total.toFixed(2), "205.00");
  assert.equal(activation.initialInvoice?.amountDue.toFixed(2), "205.00");
  assert.equal(activation.initialInvoice?.lineItems.length, 3);
  assert.equal(activation.initialInvoice?.serviceSnapshots.length, 2);
  assert.equal(await prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: subscription.id, status: "active" } }), 1);
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).nextBillingDate?.toISOString().slice(0, 10), "2026-11-01");
});

test("invalid initial coverage rolls back activation, invoice, and schedule together", async () => {
  const customer = await createCustomer("initial-invoice-invalid");
  const staff = await createStaff("initial-invoice-invalid");
  const subscription = await createDraftCanonicalSubscription({
    customerId: customer.id,
    name: "Invalid initial coverage",
    billingIntervalMonths: 1,
    collectionMethod: "manual_invoice",
    currency: "XCD",
    defaultAgreedAmountPerCycle: "25.00",
    commercialStartDate: "2026-10-01",
    billingAnchorDate: "2026-10-01",
    nextBillingDate: "2026-11-01",
    controlMode: "canonical",
    items: [{ label: "Vehicle", serviceActivatedDate: "2026-10-01", billingEffectiveFrom: "2026-10-01" }],
  });
  await assert.rejects(() => activateCanonicalManualSubscription({
    subscriptionId: subscription.id,
    staffUserId: staff.id,
    confirmationNote: "Invalid test.",
    environment: { NODE_ENV: "test", CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true" },
    initialBilling: {
      mode: "advance_invoice",
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-15T00:00:00.000Z"),
      issueDate: new Date("2026-10-01T00:00:00.000Z"),
    },
  }), expectValidationCode("INITIAL_PERIOD_INTERVAL_MISMATCH"));
  assert.equal(await prisma.canonicalSubscriptionOperationalActivation.count({ where: { customerSubscriptionId: subscription.id } }), 0);
  assert.equal(await prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: subscription.id } }), 0);
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: subscription.id } }), 0);
});
