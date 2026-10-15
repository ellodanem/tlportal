import "server-only";

import { prisma } from "@/lib/db";
import {
  buildCanonicalSubscriptionAdminRow,
  canonicalSubscriptionUiAccess,
  normalizedMonthlyAmount,
  type CanonicalSubscriptionAdminRow,
} from "@/lib/domain/canonical-subscription-admin";
import { getCanonicalSubscriptionBillingSummary } from "@/lib/services/canonical-native-billing-service";

function customerLabel(customer: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Unnamed customer";
}

export type { CanonicalSubscriptionAdminRow } from "@/lib/domain/canonical-subscription-admin";

export async function listCanonicalSubscriptionAdminRows(): Promise<CanonicalSubscriptionAdminRow[]> {
  const subscriptions = await prisma.customerSubscription.findMany({
    orderBy: [{ nextBillingDate: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    include: {
      customer: { select: { company: true, firstName: true, lastName: true } },
      canonicalMigrationLedger: { select: { id: true } },
      _count: { select: { items: true } },
    },
  });

  return Promise.all(subscriptions.map(async (subscription) => {
    if (subscription.controlMode === "legacy") {
      return buildCanonicalSubscriptionAdminRow({
        id: subscription.id,
        customerId: subscription.customerId,
        customer: customerLabel(subscription.customer),
        name: subscription.name?.trim() || "Legacy card subscription",
        reference: subscription.reference,
        collectionMethod: "stripe_autocharge",
        lifecycleStatus: subscription.status,
        controlMode: subscription.controlMode,
        hasMigrationLedger: false,
        billingIntervalMonths: subscription.planTermMonths,
        currency: "XCD",
        itemCount: subscription.vehicleCount ?? 0,
        recurringCycleTotal: null,
        legacyMonthlyRate: subscription.monthlyRateXcd?.toString() ?? null,
        legacyQuantity: subscription.vehicleCount,
        nextBillingDate: subscription.currentPeriodEnd,
        collectionHealth: null,
        attentionRequired: ["past_due", "unpaid", "pending_payment"].includes(subscription.status),
      });
    }

    const summary = await getCanonicalSubscriptionBillingSummary(subscription.id);
    return buildCanonicalSubscriptionAdminRow({
      id: subscription.id,
      customerId: subscription.customerId,
      customer: customerLabel(subscription.customer),
      name: subscription.name?.trim() || "Canonical subscription",
      reference: subscription.reference,
      collectionMethod: subscription.collectionMethod,
      lifecycleStatus: subscription.lifecycleStatus ?? "unclassified",
      controlMode: subscription.controlMode,
      hasMigrationLedger: Boolean(subscription.canonicalMigrationLedger),
      billingIntervalMonths: subscription.billingIntervalMonths,
      currency: subscription.currency ?? "XCD",
      itemCount: subscription._count.items,
      recurringCycleTotal: summary.recurringCycleTotal,
      nextBillingDate: subscription.nextBillingDate,
      collectionHealth: summary.collectionHealth,
      attentionRequired: summary.attentionRequired,
    });
  }));
}

export async function getCanonicalSubscriptionAdminDetail(subscriptionId: string) {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: {
        select: { id: true, company: true, firstName: true, lastName: true, email: true },
      },
      canonicalMigrationLedger: { select: { id: true, status: true, sourceKind: true } },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] },
          serviceAssignments: {
            orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
            include: {
              device: { select: { id: true, label: true, deviceModel: { select: { name: true } } } },
            },
          },
        },
      },
      providerLinks: {
        orderBy: [{ activatedAt: "desc" }, { id: "asc" }],
        select: { id: true, provider: true, providerStatus: true, activatedAt: true, endedAt: true },
      },
      invoices: {
        orderBy: [{ issueDate: "desc" }, { id: "desc" }],
        take: 10,
        select: { id: true, number: true, status: true, total: true, amountDue: true, issueDate: true },
      },
      billingInvoices: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
        select: {
          id: true,
          displayNumber: true,
          providerInvoiceNumber: true,
          provider: true,
          status: true,
          amountXcd: true,
          createdAt: true,
        },
      },
    },
  });
  if (!subscription) return null;

  const access = canonicalSubscriptionUiAccess({
    controlMode: subscription.controlMode,
    lifecycleStatus: subscription.lifecycleStatus,
    hasMigrationLedger: Boolean(subscription.canonicalMigrationLedger),
  });
  const summary = subscription.controlMode === "legacy"
    ? null
    : await getCanonicalSubscriptionBillingSummary(subscription.id);

  return {
    ...subscription,
    customerLabel: customerLabel(subscription.customer),
    access,
    summary,
    normalizedMrr: normalizedMonthlyAmount(
      summary?.recurringCycleTotal ?? null,
      subscription.billingIntervalMonths,
    ),
  };
}
