import "server-only";

import { prisma } from "@/lib/db";
import {
  analyzeSubscriptionMigration,
  type LegacyBillingSnapshot,
  type SubscriptionMigrationAnalysis,
} from "@/lib/domain/subscription-migration-analysis";

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

/**
 * Loads a read-only, minimally identifying snapshot for Phase 2A analysis.
 * This function deliberately uses findMany only and does not call Stripe or any
 * billing operation. Customer contact details and hardware identifiers are not selected.
 */
export async function loadLegacyBillingSnapshot(
  analysisDate: string,
): Promise<LegacyBillingSnapshot> {
  const [
    customers,
    subscriptions,
    billingAccounts,
    catalogPrices,
    devices,
    simCards,
    assignments,
    recurringSchedules,
    invoices,
    billingInvoices,
    payments,
  ] = await Promise.all([
    prisma.customer.findMany({
      select: { id: true, billingMode: true, archivedAt: true },
      orderBy: { id: "asc" },
    }),
    prisma.customerSubscription.findMany({
      select: {
        id: true,
        customerId: true,
        controlMode: true,
        status: true,
        planTermMonths: true,
        monthlyRateXcd: true,
        vehicleCount: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAt: true,
        agreedAmountPerCycle: true,
        currency: true,
        billingAnchorDate: true,
        nextBillingDate: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.billingAccount.findMany({
      select: {
        id: true,
        customerId: true,
        provider: true,
        externalCustomerId: true,
        status: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.subscriptionCatalogPrice.findMany({
      select: {
        id: true,
        monthlyRateXcd: true,
        durationMonths: true,
        isActive: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.device.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.simCard.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.serviceAssignment.findMany({
      select: {
        id: true,
        customerId: true,
        deviceId: true,
        simCardId: true,
        status: true,
        startDate: true,
        endDate: true,
        intervalMonths: true,
        nextDueDate: true,
        invoilessRecurringId: true,
        subscriptionItemId: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.recurringInvoiceSchedule.findMany({
      select: {
        id: true,
        customerId: true,
        customerSubscriptionId: true,
        serviceAssignmentId: true,
        status: true,
        intervalMonths: true,
        currency: true,
        nextIssueDate: true,
        lineItems: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.invoice.findMany({
      select: {
        id: true,
        customerId: true,
        customerSubscriptionId: true,
        recurringScheduleId: true,
        billingInvoiceId: true,
        status: true,
        kind: true,
        migrationClassification: true,
        currency: true,
        subtotal: true,
        taxLabel: true,
        taxRatePercent: true,
        taxTotal: true,
        total: true,
        amountPaid: true,
        amountDue: true,
        issueDate: true,
        archivedAt: true,
        recurringGenerationKey: true,
        invoilessInvoiceId: true,
        lineItems: {
          select: { id: true, quantity: true, unitPrice: true, lineTotal: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.billingInvoice.findMany({
      select: {
        id: true,
        customerId: true,
        customerSubscriptionId: true,
        subscriptionProviderLinkId: true,
        provider: true,
        externalInvoiceId: true,
        status: true,
        kind: true,
        amountXcd: true,
        currency: true,
        stripeSubscriptionId: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.payment.findMany({
      select: {
        id: true,
        invoiceId: true,
        customerId: true,
        amount: true,
        currency: true,
        method: true,
        reference: true,
        stripePaymentIntentId: true,
        voidedAt: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    schemaVersion: "phase-2a-source-v2",
    analysisDate,
    customers: customers.map((entry) => ({
      id: entry.id,
      billingMode: entry.billingMode,
      archivedAt: iso(entry.archivedAt),
    })),
    subscriptions: subscriptions.map((entry) => ({
      ...entry,
      monthlyRateXcd: entry.monthlyRateXcd?.toFixed(2) ?? null,
      agreedAmountPerCycle: entry.agreedAmountPerCycle?.toFixed(2) ?? null,
      currentPeriodStart: iso(entry.currentPeriodStart),
      currentPeriodEnd: iso(entry.currentPeriodEnd),
      cancelAt: iso(entry.cancelAt),
      billingAnchorDate: iso(entry.billingAnchorDate),
      nextBillingDate: iso(entry.nextBillingDate),
    })),
    billingAccounts,
    catalogPrices: catalogPrices.map((entry) => ({
      ...entry,
      monthlyRateXcd: entry.monthlyRateXcd.toFixed(2),
    })),
    inventory: {
      deviceIds: devices.map((entry) => entry.id),
      simCardIds: simCards.map((entry) => entry.id),
    },
    assignments: assignments.map((entry) => ({
      ...entry,
      startDate: iso(entry.startDate),
      endDate: iso(entry.endDate),
      nextDueDate: iso(entry.nextDueDate),
    })),
    recurringSchedules: recurringSchedules.map((entry) => ({
      ...entry,
      nextIssueDate: entry.nextIssueDate.toISOString(),
      lineItems: entry.lineItems.map((line) => ({
        ...line,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
    })),
    invoices: invoices.map((entry) => ({
      ...entry,
      subtotal: entry.subtotal.toFixed(2),
      taxRatePercent: entry.taxRatePercent?.toFixed(2) ?? null,
      taxTotal: entry.taxTotal.toFixed(2),
      total: entry.total.toFixed(2),
      amountPaid: entry.amountPaid.toFixed(2),
      amountDue: entry.amountDue.toFixed(2),
      issueDate: entry.issueDate.toISOString(),
      archivedAt: iso(entry.archivedAt),
      lineItems: entry.lineItems.map((line) => ({
        ...line,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
    })),
    billingInvoices: billingInvoices.map((entry) => ({
      ...entry,
      amountXcd: entry.amountXcd.toFixed(2),
      periodStart: iso(entry.periodStart),
      periodEnd: iso(entry.periodEnd),
      createdAt: entry.createdAt.toISOString(),
    })),
    payments: payments.map((entry) => ({
      ...entry,
      amount: entry.amount.toFixed(2),
      voidedAt: iso(entry.voidedAt),
    })),
  };
}

export async function previewLegacyBillingMigration(
  analysisDate: string,
): Promise<SubscriptionMigrationAnalysis> {
  return analyzeSubscriptionMigration(await loadLegacyBillingSnapshot(analysisDate));
}
