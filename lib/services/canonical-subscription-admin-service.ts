import "server-only";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import {
  buildCanonicalSubscriptionAdminRow,
  canonicalSubscriptionUiAccess,
  deriveCanonicalProviderStatus,
  normalizedMonthlyAmount,
  type CanonicalSubscriptionAdminRow,
} from "@/lib/domain/canonical-subscription-admin";
import { CanonicalAnnualAdjustmentError } from "@/lib/domain/canonical-annual-adjustment";
import { getAnnualServiceAdjustmentProposal } from "@/lib/services/canonical-annual-adjustment-service";
import { getCanonicalSubscriptionBillingSummary } from "@/lib/services/canonical-native-billing-service";
import { getCanonicalManualPilotReview } from "@/lib/services/canonical-manual-pilot-service";

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

/** Admin layout auth is the first boundary; this second check confirms the session belongs to a staff User row. */
export async function canonicalSubscriptionUiStaffViewer(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true } });
  return Boolean(user);
}

export async function listCanonicalSubscriptionAdminRows(): Promise<CanonicalSubscriptionAdminRow[]> {
  const subscriptions = await prisma.customerSubscription.findMany({
    orderBy: [{ nextBillingDate: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    include: {
      customer: { select: { company: true, firstName: true, lastName: true } },
      canonicalMigrationLedger: { select: { id: true } },
      providerLinks: { select: { provider: true, endedAt: true, lastError: true } },
      billingOperations: { select: { status: true, failureMessage: true } },
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
        providerStatus: "not_applicable",
      });
    }

    const summary = await getCanonicalSubscriptionBillingSummary(subscription.id);
    const providerStatus = deriveCanonicalProviderStatus({
      controlMode: subscription.controlMode,
      collectionMethod: subscription.collectionMethod,
      providerLinks: subscription.providerLinks,
      operationStatuses: subscription.billingOperations,
    });
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
      attentionRequired: summary.attentionRequired || providerStatus === "attention",
      providerStatus,
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
        select: {
          id: true,
          provider: true,
          externalSubscriptionId: true,
          providerStatus: true,
          activatedAt: true,
          endedAt: true,
          lastSyncedAt: true,
          lastError: true,
          providerItems: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              externalSubscriptionItemId: true,
              externalPriceId: true,
              currency: true,
              billingIntervalMonths: true,
              agreedAmountPerCycle: true,
              quantity: true,
              rateGroupFingerprint: true,
              lastSyncedAt: true,
            },
          },
        },
      },
      billingOperations: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
        select: {
          id: true,
          type: true,
          status: true,
          providerReference: true,
          providerSubscriptionReference: true,
          attemptCount: true,
          lastAttemptAt: true,
          completedAt: true,
          failureCode: true,
          failureMessage: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: [{ issueDate: "desc" }, { id: "desc" }],
        take: 10,
        select: {
          id: true,
          number: true,
          status: true,
          kind: true,
          total: true,
          amountPaid: true,
          amountDue: true,
          issueDate: true,
          dueDate: true,
          paidAt: true,
          payments: {
            orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
            take: 5,
            select: { id: true, amount: true, method: true, receivedAt: true, voidedAt: true },
          },
        },
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
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          stripeSubscriptionId: true,
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

  const providerStatus = deriveCanonicalProviderStatus({
    controlMode: subscription.controlMode,
    collectionMethod: subscription.collectionMethod,
    providerLinks: subscription.providerLinks,
    operationStatuses: subscription.billingOperations,
  });
  const adjustmentStatuses = subscription.controlMode === "legacy" || subscription.billingIntervalMonths !== 12
    ? subscription.items.map((item) => ({ itemId: item.id, status: "not_applicable" as const, message: "Annual adjustment status applies only to annual canonical arrangements.", proposal: null }))
    : await Promise.all(subscription.items.map(async (item) => {
      try {
        const proposal = await getAnnualServiceAdjustmentProposal(item.id);
        return {
          itemId: item.id,
          status: proposal.existingInvoice ? "issued" as const : proposal.invoiceRequired ? "preview_available" as const : "not_required" as const,
          message: proposal.existingInvoice ? "An adjustment invoice already exists for this annual period." : "A reviewed preview is available; explicit authorization is still required.",
          proposal,
        };
      } catch (error) {
        return {
          itemId: item.id,
          status: "blocked" as const,
          message: error instanceof CanonicalAnnualAdjustmentError ? error.message : "Adjustment status is unavailable.",
          proposal: null,
        };
      }
    }));
  let manualPilotReview: Awaited<ReturnType<typeof getCanonicalManualPilotReview>> | null = null;
  let manualPilotReviewError: string | null = null;
  if (subscription.canonicalMigrationLedger?.sourceKind === "manual_schedule") {
    try {
      manualPilotReview = await getCanonicalManualPilotReview(subscription.id);
    } catch (error) {
      manualPilotReviewError = error instanceof Error ? error.message : "Manual pilot readiness is unavailable.";
    }
  }

  return {
    ...subscription,
    customerLabel: customerLabel(subscription.customer),
    access,
    summary,
    normalizedMrr: normalizedMonthlyAmount(
      summary?.recurringCycleTotal ?? null,
      subscription.billingIntervalMonths,
    ),
    providerStatus,
    adjustmentStatuses,
    manualPilotReview,
    manualPilotReviewError,
  };
}
