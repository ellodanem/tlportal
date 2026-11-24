import { prisma } from "../../lib/db";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FIXTURE_COMPANY_RE = new RegExp(
  [
    `^[A-Za-z0-9._-]+-${UUID}$`,
    `^Phase 3[ABP]\\d? ${UUID}$`,
    `^Phase 4A synthetic `,
    `^Established cheque pilot `,
    `^Canonical (fixture|schedule|Stripe) ${UUID}$`,
    `^simple-stripe-${UUID}$`,
  ].join("|"),
  "i",
);

export class RemotePostgresTestDatabaseError extends Error {
  constructor(host: string) {
    super(
      `Postgres integration tests refuse to run against remote host "${host}". Use local Docker (docker compose up -d) or the CI tlportal_test database.`,
    );
    this.name = "RemotePostgresTestDatabaseError";
  }
}

export function assertLocalPostgres(databaseUrl = process.env.DATABASE_URL ?? ""): void {
  if (!databaseUrl.trim()) {
    throw new RemotePostgresTestDatabaseError("(missing DATABASE_URL)");
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new RemotePostgresTestDatabaseError("(invalid DATABASE_URL)");
  }
  const host = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new RemotePostgresTestDatabaseError(host);
  }
}

export function isIntegrationFixtureCompany(company: string | null | undefined): boolean {
  return Boolean(company && FIXTURE_COMPANY_RE.test(company));
}

type FixtureCustomerRow = {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  billingAccounts: { id: string }[];
  customerSubscriptions: { stripeCustomerId: string | null; stripeSubscriptionId: string | null }[];
};

export function isSafeIntegrationFixtureCustomer(customer: FixtureCustomerRow): boolean {
  if (!isIntegrationFixtureCompany(customer.company)) return false;
  if (customer.firstName || customer.lastName || customer.phone) return false;
  if (customer.email && !customer.email.toLowerCase().endsWith("@example.test")) return false;
  if (customer.billingAccounts.length > 0) return false;
  return customer.customerSubscriptions.every(
    (subscription) => !subscription.stripeCustomerId && !subscription.stripeSubscriptionId,
  );
}

export async function cleanupIntegrationFixtures(): Promise<{ deletedCustomers: number; skippedCustomers: number }> {
  const candidates = await prisma.customer.findMany({
    where: { company: { not: null } },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      billingAccounts: { select: { id: true } },
      customerSubscriptions: { select: { stripeCustomerId: true, stripeSubscriptionId: true } },
    },
  });
  const targets = candidates.filter(isSafeIntegrationFixtureCustomer);
  const skippedCustomers = candidates.filter((customer) => isIntegrationFixtureCompany(customer.company)).length
    - targets.length;
  if (!targets.length) return { deletedCustomers: 0, skippedCustomers };

  const ids = targets.map((customer) => customer.id);
  await prisma.recurringInvoiceSchedule.updateMany({
    where: { customerId: { in: ids } },
    data: { status: "ended", autoEmail: false, emailTo: null, lastInvoiceId: null },
  });
  await prisma.recurringInvoiceSchedule.updateMany({
    where: {
      customerId: null,
      OR: [
        { name: "Unmigrated legacy schedule" },
        { name: { startsWith: "Canonical schedule " } },
        { name: { startsWith: "Canonical fixture " } },
      ],
    },
    data: { status: "ended", autoEmail: false, emailTo: null, lastInvoiceId: null },
  });

  const subscriptions = await prisma.customerSubscription.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  const subscriptionIds = subscriptions.map((row) => row.id);
  const items = subscriptionIds.length
    ? await prisma.subscriptionItem.findMany({
        where: { customerSubscriptionId: { in: subscriptionIds } },
        select: { id: true },
      })
    : [];
  const itemIds = items.map((row) => row.id);
  const invoices = await prisma.invoice.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  const invoiceIds = invoices.map((row) => row.id);
  const assignments = await prisma.serviceAssignment.findMany({
    where: { customerId: { in: ids } },
    select: { deviceId: true, simCardId: true },
  });
  const deviceIds = [...new Set(assignments.map((row) => row.deviceId))];
  const simIds = [...new Set(assignments.map((row) => row.simCardId).filter((id): id is string => Boolean(id)))];
  const scheduleIds = (
    await prisma.recurringInvoiceSchedule.findMany({
      where: { customerId: { in: ids } },
      select: { id: true },
    })
  ).map((row) => row.id);

  if (invoiceIds.length) {
    await prisma.invoiceServiceSnapshot.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  }
  if (itemIds.length) {
    await prisma.invoiceServiceSnapshot.deleteMany({ where: { subscriptionItemId: { in: itemIds } } });
  }

  await prisma.canonicalSubscriptionOperationalActivation.updateMany({
    where: { customerId: { in: ids } },
    data: { initialInvoiceId: null },
  });
  await prisma.canonicalManualPilotActivation.updateMany({
    where: { customerId: { in: ids } },
    data: { sourceInvoiceId: null, canonicalScheduleId: null, legacyScheduleId: null },
  });

  if (invoiceIds.length) {
    await prisma.invoiceMigrationClassificationAudit.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }
  const orphanScheduleIds = (
    await prisma.recurringInvoiceSchedule.findMany({
      where: {
        customerId: null,
        OR: [
          { name: "Unmigrated legacy schedule" },
          { name: { startsWith: "Canonical schedule " } },
          { name: { startsWith: "Canonical fixture " } },
        ],
      },
      select: { id: true },
    })
  ).map((row) => row.id);
  const allScheduleIds = [...new Set([...scheduleIds, ...orphanScheduleIds])];
  if (allScheduleIds.length) {
    await prisma.recurringInvoiceSchedule.deleteMany({ where: { id: { in: allScheduleIds } } });
  }

  await prisma.serviceAssignment.deleteMany({ where: { customerId: { in: ids } } });

  if (itemIds.length) {
    await prisma.subscriptionItem.updateMany({
      where: { id: { in: itemIds } },
      data: { predecessorItemId: null },
    });
    await prisma.subscriptionItemRate.deleteMany({ where: { subscriptionItemId: { in: itemIds } } });
    await prisma.subscriptionItemInitialAdjustment.deleteMany({ where: { subscriptionItemId: { in: itemIds } } });
    await prisma.subscriptionItem.deleteMany({ where: { id: { in: itemIds } } });
  }

  if (subscriptionIds.length) {
    const links = await prisma.subscriptionProviderLink.findMany({
      where: { customerSubscriptionId: { in: subscriptionIds } },
      select: { id: true },
    });
    const linkIds = links.map((row) => row.id);
    if (linkIds.length) {
      await prisma.subscriptionProviderItem.deleteMany({ where: { subscriptionProviderLinkId: { in: linkIds } } });
      await prisma.subscriptionProviderLink.deleteMany({ where: { id: { in: linkIds } } });
    }
    await prisma.subscriptionCollectionProgram.deleteMany({
      where: { customerSubscriptionId: { in: subscriptionIds } },
    });
  }

  await prisma.canonicalManualPilotActivation.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.canonicalSubscriptionOperationalActivation.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.canonicalMigrationCampaignEntry.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.canonicalMigrationLedger.deleteMany({ where: { customerId: { in: ids } } });
  if (subscriptionIds.length) {
    await prisma.customerSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  }
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });

  if (deviceIds.length) {
    await prisma.device.deleteMany({
      where: { id: { in: deviceIds }, serviceAssignments: { none: {} } },
    });
  }
  if (simIds.length) {
    await prisma.simCard.deleteMany({
      where: { id: { in: simIds }, serviceAssignments: { none: {} }, device: { is: null } },
    });
  }

  return { deletedCustomers: ids.length, skippedCustomers };
}
