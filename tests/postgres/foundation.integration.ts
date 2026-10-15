import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/db";
import { generateInvoiceFromSchedule } from "../../lib/services/native-recurring-schedule-service";

after(async () => {
  await prisma.$disconnect();
});

async function expectDatabaseRejection(operation: () => Promise<unknown>): Promise<void> {
  let rejection: unknown;
  try {
    await operation();
  } catch (error) {
    rejection = error;
  }

  assert.ok(rejection, "PostgreSQL should have rejected the invalid operation.");
  if (rejection instanceof Prisma.PrismaClientKnownRequestError) {
    assert.ok(
      ["P2002", "P2003", "P2004", "P2010"].includes(rejection.code),
      `Unexpected Prisma database error code: ${rejection.code}`,
    );
    return;
  }

  assert.ok(
    rejection instanceof Prisma.PrismaClientUnknownRequestError,
    `Expected a PostgreSQL-backed Prisma error, received ${String(rejection)}`,
  );
  assert.match(
    rejection.message,
    /PostgresError[\s\S]*code: "23[A-Z0-9]{3}"/,
    "Expected an unmapped PostgreSQL integrity-constraint SQLSTATE.",
  );
}

async function createCustomer(label: string) {
  return prisma.customer.create({
    data: { company: `${label}-${randomUUID()}` },
  });
}

async function createCanonicalItem(label: string) {
  const customer = await createCustomer(label);
  const subscription = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      planTermMonths: 1,
      name: `${label} subscription`,
    },
  });
  const item = await prisma.subscriptionItem.create({
    data: {
      customerSubscriptionId: subscription.id,
      label: `${label} service`,
      status: "active",
      billingEffectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  return { customer, subscription, item };
}

async function createDevice(label: string) {
  const deviceModel = await prisma.deviceModel.create({
    data: {
      name: `${label}-${randomUUID()}`,
      retailPrice: "100.00",
    },
  });
  return prisma.device.create({
    data: {
      imei: randomUUID().replaceAll("-", "").slice(0, 15),
      deviceModelId: deviceModel.id,
    },
  });
}

test("all migrations apply in dependency order on PostgreSQL 16", async () => {
  const [version] = await prisma.$queryRaw<Array<{ versionNumber: string }>>`
    SELECT current_setting('server_version_num') AS "versionNumber"
  `;
  assert.ok(Number(version.versionNumber) >= 160000, `Expected PostgreSQL 16+, got ${version.versionNumber}`);

  const migrations = await prisma.$queryRaw<
    Array<{
      migrationName: string;
      finishedAt: Date | null;
      rolledBackAt: Date | null;
    }>
  >`
    SELECT
      migration_name AS "migrationName",
      finished_at AS "finishedAt",
      rolled_back_at AS "rolledBackAt"
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `;

  assert.ok(migrations.length > 0);
  assert.ok(migrations.every((migration) => migration.finishedAt != null));
  assert.ok(migrations.every((migration) => migration.rolledBackAt == null));

  const names = migrations.map((migration) => migration.migrationName);
  const phase0b = names.indexOf("20261014210000_recurring_invoice_safety");
  const phase0c = names.indexOf("20261014220000_stripe_operation_safety");
  const phase1a1 = names.indexOf("20261014230000_canonical_subscription_foundation");
  const phase1a2 = names.indexOf("20261014233000_subscription_items_rates_provider_links");
  assert.ok(phase0b >= 0 && phase0b < phase0c && phase0c < phase1a1 && phase1a1 < phase1a2);
});

test("btree_gist is installed and effective rate exclusions reject overlap", async () => {
  const extensions = await prisma.$queryRaw<Array<{ extensionName: string }>>`
    SELECT extname AS "extensionName"
    FROM pg_extension
    WHERE extname = 'btree_gist'
  `;
  assert.deepEqual(extensions.map((entry) => entry.extensionName), ["btree_gist"]);

  const { item } = await createCanonicalItem("rate-periods");
  await prisma.subscriptionItemRate.create({
    data: {
      subscriptionItemId: item.id,
      billingIntervalMonths: 1,
      agreedAmountPerCycle: "25.00",
      currency: "XCD",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveUntil: new Date("2026-03-01T00:00:00.000Z"),
    },
  });

  await expectDatabaseRejection(() =>
    prisma.subscriptionItemRate.create({
      data: {
        subscriptionItemId: item.id,
        billingIntervalMonths: 1,
        agreedAmountPerCycle: "20.00",
        currency: "XCD",
        effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
        effectiveUntil: new Date("2026-04-01T00:00:00.000Z"),
        classification: "negotiated",
      },
    }),
  );

  await assert.doesNotReject(() =>
    prisma.subscriptionItemRate.create({
      data: {
        subscriptionItemId: item.id,
        billingIntervalMonths: 1,
        agreedAmountPerCycle: "20.00",
        currency: "XCD",
        effectiveFrom: new Date("2026-03-01T00:00:00.000Z"),
        effectiveUntil: new Date("2026-04-01T00:00:00.000Z"),
        classification: "negotiated",
      },
    }),
  );

  await expectDatabaseRejection(() =>
    prisma.subscriptionItemRate.create({
      data: {
        subscriptionItemId: item.id,
        billingIntervalMonths: 2,
        agreedAmountPerCycle: "25.00",
        currency: "XCD",
        effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      },
    }),
  );

  await expectDatabaseRejection(() =>
    prisma.subscriptionItemRate.create({
      data: {
        subscriptionItemId: item.id,
        billingIntervalMonths: 12,
        agreedAmountPerCycle: "275.00",
        currency: "XCD",
        effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
        effectiveUntil: new Date("2027-01-01T00:00:00.000Z"),
      },
    }),
  );
});

test("open-assignment uniqueness matches cancelled assignment semantics", async () => {
  const { customer, item } = await createCanonicalItem("assignments");
  const cancelledDevice = await createDevice("cancelled-device");
  const replacementDevice = await createDevice("replacement-device");
  const conflictDevice = await createDevice("conflict-device");

  await prisma.serviceAssignment.create({
    data: {
      customerId: customer.id,
      deviceId: cancelledDevice.id,
      subscriptionItemId: item.id,
      status: "cancelled",
      endDate: null,
    },
  });

  await assert.doesNotReject(() =>
    prisma.serviceAssignment.create({
      data: {
        customerId: customer.id,
        deviceId: replacementDevice.id,
        subscriptionItemId: item.id,
        status: "active",
        endDate: null,
      },
    }),
  );

  await expectDatabaseRejection(() =>
    prisma.serviceAssignment.create({
      data: {
        customerId: customer.id,
        deviceId: conflictDevice.id,
        subscriptionItemId: item.id,
        status: "due_soon",
        endDate: null,
      },
    }),
  );
});

test("provider links require endedAt before a replacement can become open", async () => {
  const { subscription } = await createCanonicalItem("provider-links");
  const first = await prisma.subscriptionProviderLink.create({
    data: {
      customerSubscriptionId: subscription.id,
      provider: "stripe",
      externalSubscriptionId: `sub_${randomUUID()}`,
      providerStatus: "active",
    },
  });

  const replacementData = {
    customerSubscriptionId: subscription.id,
    provider: "stripe" as const,
    externalSubscriptionId: `sub_${randomUUID()}`,
    providerStatus: "active",
  };

  await expectDatabaseRejection(() =>
    prisma.subscriptionProviderLink.create({ data: replacementData }),
  );

  await prisma.subscriptionProviderLink.update({
    where: { id: first.id },
    data: { providerStatus: "canceled" },
  });
  await expectDatabaseRejection(() =>
    prisma.subscriptionProviderLink.create({ data: replacementData }),
  );

  await prisma.subscriptionProviderLink.update({
    where: { id: first.id },
    data: { endedAt: new Date() },
  });
  await assert.doesNotReject(() =>
    prisma.subscriptionProviderLink.create({ data: replacementData }),
  );
});

test("nullable legacy relationships accept unmigrated records", async () => {
  const customer = await createCustomer("legacy-nullable");
  const legacySubscription = await prisma.customerSubscription.create({
    data: { customerId: customer.id, planTermMonths: 3 },
  });
  assert.equal(legacySubscription.controlMode, "legacy");
  assert.equal(legacySubscription.collectionMethod, null);
  assert.equal(legacySubscription.billingIntervalMonths, null);

  const device = await createDevice("legacy-device");
  const assignment = await prisma.serviceAssignment.create({
    data: {
      customerId: customer.id,
      deviceId: device.id,
      status: "active",
    },
  });
  assert.equal(assignment.subscriptionItemId, null);

  const providerInvoice = await prisma.billingInvoice.create({
    data: {
      customerId: customer.id,
      provider: "stripe",
      externalInvoiceId: `in_${randomUUID()}`,
      status: "paid",
      amountXcd: "25.00",
    },
  });
  assert.equal(providerInvoice.customerSubscriptionId, null);
  assert.equal(providerInvoice.subscriptionProviderLinkId, null);

  const invoice = await prisma.invoice.create({ data: {} });
  assert.equal(invoice.customerSubscriptionId, null);

  const schedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      name: "Unmigrated legacy schedule",
      nextIssueDate: new Date("2026-12-01T12:00:00.000Z"),
    },
  });
  assert.equal(schedule.customerSubscriptionId, null);
});

test("financial snapshots protect billed items and rates while line deletion is non-destructive", async () => {
  const { item } = await createCanonicalItem("snapshot-protection");
  const rate = await prisma.subscriptionItemRate.create({
    data: {
      subscriptionItemId: item.id,
      billingIntervalMonths: 12,
      agreedAmountPerCycle: "275.00",
      currency: "XCD",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      currency: "XCD",
      total: "275.00",
      amountDue: "275.00",
      lineItems: {
        create: {
          description: "Annual GPS tracking",
          quantity: "1",
          unitPrice: "275.00",
          lineTotal: "275.00",
        },
      },
    },
    include: { lineItems: true },
  });
  const snapshot = await prisma.invoiceServiceSnapshot.create({
    data: {
      invoiceId: invoice.id,
      invoiceLineItemId: invoice.lineItems[0].id,
      subscriptionItemId: item.id,
      subscriptionItemRateId: rate.id,
      serviceLabelSnapshot: "Annual GPS tracking",
      agreedAmountPerCycleSnapshot: "275.00",
      billedAmount: "275.00",
      currency: "XCD",
      servicePeriodStart: new Date("2026-01-01T00:00:00.000Z"),
      servicePeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
    },
  });

  await expectDatabaseRejection(() =>
    prisma.subscriptionItemRate.delete({ where: { id: rate.id } }),
  );
  await expectDatabaseRejection(() =>
    prisma.subscriptionItem.delete({ where: { id: item.id } }),
  );

  await prisma.invoiceLineItem.delete({ where: { id: invoice.lineItems[0].id } });
  const preserved = await prisma.invoiceServiceSnapshot.findUniqueOrThrow({
    where: { id: snapshot.id },
  });
  assert.equal(preserved.invoiceLineItemId, null);
  assert.equal(preserved.serviceLabelSnapshot, "Annual GPS tracking");
  const agreedAmount = preserved.agreedAmountPerCycleSnapshot;
  assert.ok(agreedAmount);
  assert.equal(agreedAmount.toFixed(2), "275.00");
  assert.equal(preserved.billedAmount.toFixed(2), "275.00");
});

test("Phase 0B row locking creates one invoice and advances one period under concurrency", async () => {
  const customer = await createCustomer("recurring-concurrency");
  const issueDate = new Date("2026-10-15T12:00:00.000Z");
  const schedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      name: "Concurrency fixture",
      currency: "XCD",
      intervalMonths: 1,
      nextIssueDate: issueDate,
      dueDaysAfterIssue: 7,
      autoEmail: false,
      lineItems: {
        create: {
          description: "GPS tracking",
          quantity: "1",
          unitPrice: "25.00",
          lineTotal: "25.00",
        },
      },
    },
  });

  const asOf = new Date("2026-10-15T13:00:00.000Z");
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      generateInvoiceFromSchedule(schedule.id, asOf, { skipIfNoLongerDue: true }),
    ),
  );

  const invoices = await prisma.invoice.findMany({
    where: { recurringScheduleId: schedule.id },
  });
  const refreshed = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({
    where: { id: schedule.id },
  });

  assert.equal(invoices.length, 1);
  assert.ok(invoices[0].recurringGenerationKey);
  assert.equal(results.filter((result) => !result.skipped && result.created).length, 1);
  assert.equal(results.filter((result) => result.skipped).length, 7);
  assert.equal(refreshed.lastInvoiceId, invoices[0].id);
  assert.equal(refreshed.nextIssueDate.toISOString(), "2026-11-15T12:00:00.000Z");
});
