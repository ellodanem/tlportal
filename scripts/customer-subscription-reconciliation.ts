/**
 * READ-ONLY reconciliation report for one customer's subscriptions.
 *
 *   node --env-file=.env.local --import tsx scripts/customer-subscription-reconciliation.ts "Plastic Solutions"
 *
 * Only SELECT-style Prisma reads are issued. Nothing is created, updated or
 * deleted, and no provider or notification service is contacted. Secrets are
 * never printed.
 */
import { PrismaClient } from "@prisma/client";

import {
  analyzeCustomerSubscriptions,
  reconciliationMarkdown,
  type ReconciliationSubscription,
} from "../lib/domain/customer-subscription-reconciliation";

const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? null;

async function main(): Promise<void> {
  const search = process.argv[2]?.trim();
  if (!search) throw new Error('Usage: scripts/customer-subscription-reconciliation.ts "<customer name fragment>"');
  const prisma = new PrismaClient();
  try {
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { company: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
        ],
      },
      select: { id: true, company: true, firstName: true, lastName: true },
      take: 10,
    });
    if (!customers.length) {
      process.stdout.write(`No customer matched "${search}".\n`);
      return;
    }
    for (const customer of customers) {
      const label = customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ");
      const subscriptions = await prisma.customerSubscription.findMany({
        where: { customerId: customer.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          canonicalMigrationLedger: { select: { id: true } },
          providerLinks: { select: { provider: true, endedAt: true } },
          recurringSchedules: { select: { status: true } },
          invoices: { select: { status: true } },
          items: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: {
              rates: { orderBy: [{ effectiveFrom: "asc" }] },
              serviceAssignments: { select: { endDate: true, status: true } },
            },
          },
        },
      });
      const today = new Date();
      const mapped: ReconciliationSubscription[] = subscriptions.map((subscription) => ({
        id: subscription.id,
        name: subscription.name,
        controlMode: subscription.controlMode,
        lifecycleStatus: subscription.lifecycleStatus,
        collectionMethod: subscription.collectionMethod,
        billingIntervalMonths: subscription.billingIntervalMonths,
        currency: subscription.currency,
        billingAnchorDate: day(subscription.billingAnchorDate),
        nextBillingDate: day(subscription.nextBillingDate),
        openRecurringSchedules: subscription.recurringSchedules.filter((schedule) => schedule.status !== "ended").length,
        openStripeProviderLinks: subscription.providerLinks.filter((link) => link.provider === "stripe" && link.endedAt == null).length,
        invoiceCount: subscription.invoices.length,
        paidInvoiceCount: subscription.invoices.filter((invoice) => invoice.status === "paid").length,
        hasMigrationLedger: Boolean(subscription.canonicalMigrationLedger),
        items: subscription.items.map((item) => {
          const rate = item.rates
            .filter((candidate) => candidate.effectiveFrom <= today && (!candidate.effectiveUntil || candidate.effectiveUntil > today))
            .at(-1) ?? null;
          return {
            id: item.id,
            label: item.label,
            status: item.status,
            billingEffectiveFrom: day(item.billingEffectiveFrom),
            billingEffectiveUntil: day(item.billingEffectiveUntil),
            serviceActivatedDate: day(item.serviceActivatedDate),
            currentRate: rate ? {
              amount: rate.agreedAmountPerCycle.toFixed(2),
              currency: rate.currency,
              billingIntervalMonths: rate.billingIntervalMonths,
              effectiveFrom: day(rate.effectiveFrom)!,
              effectiveUntil: day(rate.effectiveUntil),
            } : null,
            openDeviceAssignments: item.serviceAssignments.filter((assignment) => assignment.endDate == null && assignment.status !== "cancelled").length,
          };
        }),
      }));
      process.stdout.write(reconciliationMarkdown(label, mapped, analyzeCustomerSubscriptions(mapped)));
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
