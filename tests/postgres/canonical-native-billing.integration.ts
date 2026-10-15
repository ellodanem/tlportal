import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { Prisma } from "@prisma/client";

import type { RecurringInvoiceGenerationResult } from "../../lib/billing/recurring-invoice-coordinator";
import { prisma } from "../../lib/db";
import { CanonicalNativeBillingError } from "../../lib/domain/canonical-native-billing";
import {
  getCanonicalSubscriptionBillingSummary,
} from "../../lib/services/canonical-native-billing-service";
import {
  generateInvoiceFromSchedule,
  retryRecurringInvoiceDelivery,
} from "../../lib/services/native-recurring-schedule-service";
import { recordInvoicePayment } from "../../lib/services/native-invoice-service";

const originalFeatureFlag = process.env.CANONICAL_NATIVE_BILLING_ENABLED;
process.env.CANONICAL_NATIVE_BILLING_ENABLED = "true";

type GeneratedInvoiceResult = Exclude<RecurringInvoiceGenerationResult, { skipped: true }>;

function expectGenerated(
  result: RecurringInvoiceGenerationResult,
): asserts result is GeneratedInvoiceResult {
  assert.equal(result.skipped, false);
}

after(async () => {
  if (originalFeatureFlag == null) delete process.env.CANONICAL_NATIVE_BILLING_ENABLED;
  else process.env.CANONICAL_NATIVE_BILLING_ENABLED = originalFeatureFlag;
  await prisma.$disconnect();
});

type ItemFixture = {
  label: string;
  amount: string;
  classification?: "standard" | "negotiated";
  billingFrom?: string;
  billingUntil?: string | null;
  rates?: {
    amount: string;
    from: string;
    until?: string | null;
    classification?: "standard" | "negotiated";
  }[];
};

async function createCustomer(label: string) {
  return prisma.customer.create({ data: { company: `${label}-${randomUUID()}` } });
}

async function createCanonicalFixture(input: {
  customerId?: string;
  intervalMonths?: 1 | 3 | 6 | 12;
  nextBillingDate?: string;
  items?: ItemFixture[];
  controlMode?: "legacy" | "shadow" | "canonical";
  collectionMethod?: "manual_invoice" | "stripe_autocharge";
  lifecycleStatus?: "draft" | "pending_activation" | "active" | "paused" | "canceled" | "ended";
  autoEmail?: boolean;
  dueDaysAfterIssue?: number;
  staticScheduleAmount?: string | null;
}) {
  const customer = input.customerId
    ? await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } })
    : await createCustomer("phase-3a");
  const intervalMonths = input.intervalMonths ?? 1;
  const nextBillingDate = new Date(`${input.nextBillingDate ?? "2026-11-01"}T00:00:00.000Z`);
  const itemFixtures = input.items ?? [{ label: "Tracking service", amount: "25.00" }];
  const subscription = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      name: `Canonical fixture ${randomUUID()}`,
      collectionMethod: input.collectionMethod ?? "manual_invoice",
      lifecycleStatus: input.lifecycleStatus ?? "active",
      collectionHealth: "not_started",
      billingIntervalMonths: intervalMonths,
      currency: "XCD",
      agreedAmountPerCycle: itemFixtures[0]?.amount ?? "0.00",
      commercialStartDate: new Date("2026-01-01T00:00:00.000Z"),
      billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
      nextBillingDate,
      gracePeriodDays: 7,
      controlMode: input.controlMode ?? "canonical",
      status: "active",
      planTermMonths: intervalMonths,
    },
  });

  const items = [];
  for (const fixture of itemFixtures) {
    const billingFrom = new Date(`${fixture.billingFrom ?? "2026-01-01"}T00:00:00.000Z`);
    const item = await prisma.subscriptionItem.create({
      data: {
        customerSubscriptionId: subscription.id,
        label: fixture.label,
        status: "active",
        serviceActivatedDate: new Date("2026-01-01T00:00:00.000Z"),
        billingEffectiveFrom: billingFrom,
        billingEffectiveUntil: fixture.billingUntil
          ? new Date(`${fixture.billingUntil}T00:00:00.000Z`)
          : null,
        rates: {
          create: (fixture.rates ?? [{
            amount: fixture.amount,
            from: fixture.billingFrom ?? "2026-01-01",
            classification: fixture.classification,
          }]).map((rate) => ({
            billingIntervalMonths: intervalMonths,
            agreedAmountPerCycle: rate.amount,
            currency: "XCD",
            effectiveFrom: new Date(`${rate.from}T00:00:00.000Z`),
            effectiveUntil: rate.until ? new Date(`${rate.until}T00:00:00.000Z`) : null,
            classification: rate.classification ?? fixture.classification ?? "standard",
          })),
        },
      },
      include: { rates: { orderBy: { effectiveFrom: "asc" } } },
    });
    items.push(item);
  }

  const schedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      customerSubscriptionId: subscription.id,
      name: `Canonical schedule ${randomUUID()}`,
      currency: "XCD",
      intervalMonths,
      nextIssueDate: nextBillingDate,
      dueDaysAfterIssue: input.dueDaysAfterIssue ?? 7,
      autoEmail: input.autoEmail ?? false,
      lineItems: input.staticScheduleAmount == null
        ? undefined
        : {
            create: {
              description: "Legacy static line",
              quantity: "1.0000",
              unitPrice: input.staticScheduleAmount,
              lineTotal: input.staticScheduleAmount,
            },
          },
    },
  });
  return { customer, subscription, items, schedule, nextBillingDate };
}

test("29: one canonical item generates one attributed invoice and immutable snapshot", async () => {
  const fixture = await createCanonicalFixture({});
  const operationsBefore = await prisma.billingOperation.count();
  const result = await generateInvoiceFromSchedule(
    fixture.schedule.id,
    new Date("2026-11-01T12:00:00.000Z"),
  );
  assert.equal(result.skipped, false);
  assert.equal(result.created, true);

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: result.invoiceId },
    include: { lineItems: true, serviceSnapshots: true },
  });
  assert.equal(invoice.customerSubscriptionId, fixture.subscription.id);
  assert.equal(invoice.subtotal.toFixed(2), "25.00");
  assert.equal(invoice.total.toFixed(2), "25.00");
  assert.equal(invoice.lineItems.length, 1);
  assert.equal(invoice.serviceSnapshots.length, 1);
  assert.equal(invoice.serviceSnapshots[0].subscriptionItemId, fixture.items[0].id);
  assert.equal(invoice.serviceSnapshots[0].subscriptionItemRateId, fixture.items[0].rates[0].id);
  assert.equal(invoice.serviceSnapshots[0].billedAmount.toFixed(2), "25.00");
  assert.equal(invoice.serviceSnapshots[0].servicePeriodStart?.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(invoice.serviceSnapshots[0].servicePeriodEnd?.toISOString().slice(0, 10), "2026-12-01");
  assert.equal(await prisma.billingOperation.count(), operationsBefore);
  assert.equal(await prisma.billingInvoice.count({ where: { customerSubscriptionId: fixture.subscription.id } }), 0);

  const advanced = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
  assert.equal(advanced.nextBillingDate?.toISOString().slice(0, 10), "2026-12-01");
});

test("30: mixed standard and negotiated services invoice exactly EC$70", async () => {
  const fixture = await createCanonicalFixture({
    items: [
      { label: "Service A", amount: "25.00" },
      { label: "Service B", amount: "25.00" },
      { label: "Service C", amount: "20.00", classification: "negotiated" },
    ],
  });
  const result = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z"));
  expectGenerated(result);
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: result.invoiceId },
    include: { serviceSnapshots: { include: { subscriptionItemRate: true } } },
  });
  assert.equal(invoice.total.toFixed(2), "70.00");
  assert.equal(invoice.serviceSnapshots.length, 3);
  assert.equal(
    invoice.serviceSnapshots.reduce((sum, snapshot) => sum.plus(snapshot.billedAmount), new Prisma.Decimal(0)).toFixed(2),
    "70.00",
  );
  assert.equal(invoice.serviceSnapshots.filter((snapshot) => snapshot.subscriptionItemRate?.classification === "negotiated").length, 1);
});

test("31: quarterly, six-month, and explicit annual arrangements retain approved cycle prices", async () => {
  for (const [intervalMonths, amount] of [[3, "60.00"], [6, "115.00"], [12, "275.00"]] as const) {
    const fixture = await createCanonicalFixture({
      intervalMonths,
      nextBillingDate: "2027-01-01",
      items: [{ label: `${intervalMonths}-month service`, amount, billingFrom: "2027-01-01" }],
    });
    const result = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2027-01-01T12:00:00.000Z"));
    expectGenerated(result);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } });
    assert.equal(invoice.total.toFixed(2), amount);
    const advanced = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    const expectedMonth = intervalMonths === 12 ? "2028-01-01" : intervalMonths === 6 ? "2027-07-01" : "2027-04-01";
    assert.equal(advanced.nextBillingDate?.toISOString().slice(0, 10), expectedMonth);
  }
});

test("32: multiple same-frequency subscriptions for one customer bill independently", async () => {
  const customer = await createCustomer("multiple-subscriptions");
  const first = await createCanonicalFixture({ customerId: customer.id, items: [{ label: "Fleet A", amount: "25.00" }] });
  const second = await createCanonicalFixture({ customerId: customer.id, items: [{ label: "Fleet B", amount: "40.00" }] });
  const results = await Promise.all([
    generateInvoiceFromSchedule(first.schedule.id, new Date("2026-11-01T12:00:00.000Z")),
    generateInvoiceFromSchedule(second.schedule.id, new Date("2026-11-01T12:00:00.000Z")),
  ]);
  const invoiceIds = results.map((result) => {
    expectGenerated(result);
    return result.invoiceId;
  });
  assert.equal(new Set(invoiceIds).size, 2);
  const invoices = await prisma.invoice.findMany({
    where: { customerId: customer.id, id: { in: invoiceIds } },
    orderBy: { total: "asc" },
  });
  assert.deepEqual(invoices.map((invoice) => invoice.total.toFixed(2)), ["25.00", "40.00"]);
  assert.equal(new Set(invoices.map((invoice) => invoice.customerSubscriptionId)).size, 2);
});

test("33: additions, removals, rate changes, and hardware replacement preserve period history", async () => {
  const fixture = await createCanonicalFixture({
    items: [
      {
        label: "Changing service",
        amount: "25.00",
        rates: [
          { amount: "25.00", from: "2026-01-01", until: "2026-12-01" },
          { amount: "20.00", from: "2026-12-01", classification: "negotiated" },
        ],
      },
      { label: "Removed service", amount: "25.00", billingUntil: "2026-12-01" },
      { label: "Mid-cycle addition", amount: "25.00", billingFrom: "2026-12-01" },
    ],
  });
  const changingItem = fixture.items[0];
  const model = await prisma.deviceModel.create({ data: { name: `replacement-${randomUUID()}`, retailPrice: "100.00" } });
  for (const [status, startDate, endDate] of [
    ["cancelled", "2026-01-01", "2026-10-15"],
    ["active", "2026-10-15", null],
  ] as const) {
    const device = await prisma.device.create({
      data: { imei: randomUUID().replaceAll("-", "").slice(0, 15), deviceModelId: model.id },
    });
    await prisma.serviceAssignment.create({
      data: {
        customerId: fixture.customer.id,
        deviceId: device.id,
        subscriptionItemId: changingItem.id,
        status,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
      },
    });
  }

  const november = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z"));
  const december = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-12-01T12:00:00.000Z"));
  expectGenerated(november);
  expectGenerated(december);
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: [november.invoiceId, december.invoiceId] } },
    orderBy: { issueDate: "asc" },
    include: { serviceSnapshots: true },
  });
  assert.deepEqual(invoices.map((invoice) => invoice.total.toFixed(2)), ["50.00", "45.00"]);
  assert.deepEqual(invoices.map((invoice) => invoice.serviceSnapshots.length), [2, 2]);
  const changingSnapshots = invoices.flatMap((invoice) => invoice.serviceSnapshots)
    .filter((snapshot) => snapshot.subscriptionItemId === changingItem.id);
  assert.deepEqual(changingSnapshots.map((snapshot) => snapshot.billedAmount.toFixed(2)), ["25.00", "20.00"]);
  assert.equal(await prisma.serviceAssignment.count({ where: { subscriptionItemId: changingItem.id } }), 2);
});

test("34: partial payment drives outstanding balance and seven-day staff attention without suspension", async () => {
  const fixture = await createCanonicalFixture({ dueDaysAfterIssue: 0 });
  const generated = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z"));
  expectGenerated(generated);
  const payment = await recordInvoicePayment({ invoiceId: generated.invoiceId, amount: 10, method: "cheque" });
  assert.equal(payment.status, "partially_paid");
  assert.equal(payment.amountDue, 15);

  const summary = await getCanonicalSubscriptionBillingSummary(
    fixture.subscription.id,
    new Date("2026-11-09T00:00:00.000Z"),
    { NODE_ENV: "test", CANONICAL_NATIVE_BILLING_ENABLED: "true" },
  );
  assert.equal(summary.outstandingBalance, "15.00");
  assert.equal(summary.collectionHealth, "action_required");
  assert.equal(summary.attentionRequired, true);
  assert.equal(summary.recurringCycleTotal, "25.00");
  assert.equal(summary.items.length, 1);
  assert.equal(summary.eligibleForExecution, true);
  const unchanged = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
  assert.equal(unchanged.lifecycleStatus, "active");
  assert.equal((await prisma.subscriptionItem.findUniqueOrThrow({ where: { id: fixture.items[0].id } })).status, "active");
});

test("35: concurrent generation creates one canonical invoice and one snapshot set", async () => {
  const fixture = await createCanonicalFixture({
    items: [{ label: "A", amount: "25.00" }, { label: "B", amount: "20.00" }],
  });
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    generateInvoiceFromSchedule(
      fixture.schedule.id,
      new Date("2026-11-01T12:00:00.000Z"),
      { skipIfNoLongerDue: true },
    )));
  assert.equal(results.filter((result) => !result.skipped && result.created).length, 1);
  assert.equal(results.filter((result) => result.skipped).length, 7);
  const invoices = await prisma.invoice.findMany({ where: { customerSubscriptionId: fixture.subscription.id } });
  assert.equal(invoices.length, 1);
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { invoiceId: invoices[0].id } }), 2);
});

test("36: failed delivery retries the original canonical invoice without rebilling", async () => {
  const fixture = await createCanonicalFixture({ autoEmail: true });
  const first = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z"));
  expectGenerated(first);
  assert.equal(first.created, true);
  assert.match(first.emailError ?? "", /No recipient email/);
  const retried = await retryRecurringInvoiceDelivery(first.invoiceId, new Date("2026-11-02T00:00:00.000Z"));
  expectGenerated(retried);
  assert.equal(retried.created, false);
  assert.equal(retried.invoiceId, first.invoiceId);
  assert.match(retried.emailError ?? "", /No recipient email/);
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: fixture.subscription.id } }), 1);
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { invoiceId: first.invoiceId } }), 1);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: first.invoiceId } });
  assert.equal(invoice.recurringDeliveryAttempts, 2);
  assert.equal(invoice.recurringDeliveryStatus, "failed");
});

test("37: feature, collection, shadow, and duplicate-schedule guards isolate canonical billing", async () => {
  const disabled = await createCanonicalFixture({});
  delete process.env.CANONICAL_NATIVE_BILLING_ENABLED;
  await assert.rejects(
    generateInvoiceFromSchedule(disabled.schedule.id, new Date("2026-11-01T12:00:00.000Z")),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError && caught.code === "FEATURE_DISABLED",
  );
  process.env.CANONICAL_NATIVE_BILLING_ENABLED = "true";
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: disabled.subscription.id } }), 0);

  const stripe = await createCanonicalFixture({ collectionMethod: "stripe_autocharge" });
  await assert.rejects(
    generateInvoiceFromSchedule(stripe.schedule.id, new Date("2026-11-01T12:00:00.000Z")),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError && caught.code === "WRONG_COLLECTION_METHOD",
  );

  const shadow = await createCanonicalFixture({ controlMode: "shadow", staticScheduleAmount: "19.00" });
  const shadowResult = await generateInvoiceFromSchedule(shadow.schedule.id, new Date("2026-11-01T12:00:00.000Z"));
  expectGenerated(shadowResult);
  const shadowInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: shadowResult.invoiceId } });
  assert.equal(shadowInvoice.customerSubscriptionId, null);
  assert.equal(shadowInvoice.total.toFixed(2), "19.00");
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { invoiceId: shadowInvoice.id } }), 0);

  await assert.rejects(prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: disabled.customer.id,
      customerSubscriptionId: disabled.subscription.id,
      currency: "XCD",
      intervalMonths: 1,
      nextIssueDate: new Date("2026-12-01T00:00:00.000Z"),
      autoEmail: false,
    },
  }));
});

test("38: a financial-resolution failure rolls back cleanly and a corrected retry creates one invoice", async () => {
  const fixture = await createCanonicalFixture({});
  await prisma.subscriptionItemRate.deleteMany({
    where: { subscriptionItemId: fixture.items[0].id },
  });
  await assert.rejects(
    generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z")),
    (caught: unknown) => caught instanceof CanonicalNativeBillingError && caught.code === "ITEM_RATE_MISSING",
  );
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: fixture.subscription.id } }), 0);
  const unchanged = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.schedule.id } });
  assert.equal(unchanged.nextIssueDate.toISOString().slice(0, 10), "2026-11-01");

  await prisma.subscriptionItemRate.create({
    data: {
      subscriptionItemId: fixture.items[0].id,
      billingIntervalMonths: 1,
      agreedAmountPerCycle: "25.00",
      currency: "XCD",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const retried = await generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z"));
  expectGenerated(retried);
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: fixture.subscription.id } }), 1);
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { invoiceId: retried.invoiceId } }), 1);
});
