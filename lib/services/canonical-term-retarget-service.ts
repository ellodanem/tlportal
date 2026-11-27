import "server-only";

import { prisma } from "@/lib/db";
import { currentServiceRate } from "@/lib/domain/canonical-service-presentation";
import {
  CanonicalSubscriptionValidationError,
  commercialDateString,
} from "@/lib/domain/canonical-subscription-application";
import {
  defaultTermRetargetInterval,
  planTermRetarget,
  suggestedSuccessorCycleAmount,
  termRetargetBlockers,
  type TermRetargetInvoiceDisposition,
  type TermRetargetLiveService,
  type TermRetargetPanelService,
  type TermRetargetPlan,
  type TermRetargetServiceAmount,
  type TermRetargetSnapshot,
} from "@/lib/domain/canonical-term-retarget";
import { cadenceLabel } from "@/lib/domain/subscription-proration";
import {
  CanonicalCollectionProgramError,
  sendStaffPayNowCheckout,
} from "@/lib/services/canonical-collection-program-service";
import { retargetCanonicalSubscriptionTerm } from "@/lib/services/canonical-subscription-application-service";
import {
  CanonicalStripeCardOnFileError,
  inspectStripeCardOnFileReadiness,
  type CardOnFilePanelState,
} from "@/lib/services/canonical-stripe-card-on-file-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { isStripeBillingEnabled } from "@/lib/stripe/config";

const VOIDABLE_INVOICE_STATUSES = ["open", "partially_paid", "overdue"] as const;

export type TermRetargetPanelState = {
  blockers: string[];
  snapshot: TermRetargetSnapshot | null;
  defaultTargetIntervalMonths: number | null;
  services: TermRetargetPanelService[];
  leftover: Pick<CardOnFilePanelState, "leftoverSummary" | "requiresExplicitCancel" | "liveSubscriptions"> | null;
};

export type TermRetargetAndPayNowResult = {
  sourceSubscriptionId: string;
  targetSubscriptionId: string;
  successorItemIds: string[];
  voidedInvoiceNumbers: string[];
  cycleTotal: string;
  targetIntervalMonths: number;
  checkoutUrl: string | null;
  notifySummary: string | null;
  checkoutError: string | null;
};

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

async function loadSnapshot(subscriptionId: string): Promise<TermRetargetSnapshot> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: { select: { email: true } },
      canonicalMigrationLedger: { select: { id: true } },
      providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } },
      items: {
        where: { status: { notIn: ["ended", "canceled"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] } },
      },
      invoices: {
        where: {
          status: { in: [...VOIDABLE_INVOICE_STATUSES] },
          kind: { not: "subscription_mirror" },
          archivedAt: null,
        },
        orderBy: [{ issueDate: "asc" }, { id: "asc" }],
        select: { id: true, number: true, amountDue: true, currency: true, status: true },
      },
    },
  });
  if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");

  const liveServices: TermRetargetLiveService[] = subscription.items.map((item) => {
    const rate = currentServiceRate(item.rates);
    return {
      id: item.id,
      label: item.label?.trim() || "Tracking service",
      status: item.status,
      currentAmount: rate ? rate.agreedAmountPerCycle.toFixed(2) : "0.00",
      currentIntervalMonths: rate?.billingIntervalMonths ?? subscription.billingIntervalMonths ?? 1,
    };
  });

  return {
    id: subscription.id,
    name: subscription.name,
    customerId: subscription.customerId,
    controlMode: subscription.controlMode,
    lifecycleStatus: subscription.lifecycleStatus,
    collectionMethod: subscription.collectionMethod,
    billingIntervalMonths: subscription.billingIntervalMonths,
    currency: subscription.currency,
    nextBillingDate: subscription.nextBillingDate,
    hasMigrationLedger: Boolean(subscription.canonicalMigrationLedger),
    hasOpenStripeLink: subscription.providerLinks.length > 0,
    customerEmail: subscription.customer.email,
    stripeBillingEnabled: isStripeBillingEnabled(),
    liveServices,
    openInvoices: subscription.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amountDue: invoice.amountDue.toFixed(2),
      currency: invoice.currency,
      status: invoice.status,
    })),
  };
}

export async function inspectTermRetargetReadiness(subscriptionId: string): Promise<TermRetargetPanelState> {
  const snapshot = await loadSnapshot(subscriptionId);
  const blockers = termRetargetBlockers(snapshot);
  const defaultTargetIntervalMonths = snapshot.billingIntervalMonths
    ? defaultTermRetargetInterval(snapshot.billingIntervalMonths)
    : null;
  const services: TermRetargetPanelService[] = snapshot.liveServices.map((service) => ({
    ...service,
    suggestedAmount: defaultTargetIntervalMonths
      ? suggestedSuccessorCycleAmount(service.currentAmount, service.currentIntervalMonths, defaultTargetIntervalMonths).toFixed(2)
      : service.currentAmount,
  }));

  if (blockers.length) {
    return { blockers, snapshot, defaultTargetIntervalMonths, services, leftover: null };
  }

  let leftover: TermRetargetPanelState["leftover"] = null;
  try {
    const card = await inspectStripeCardOnFileReadiness(subscriptionId, "pay_now");
    leftover = {
      leftoverSummary: card.leftoverSummary,
      requiresExplicitCancel: card.requiresExplicitCancel,
      liveSubscriptions: card.liveSubscriptions,
    };
    const cardBlockers = card.blockers.filter((blocker) =>
      /billing email|not enabled|already has a live subscription linked/i.test(blocker),
    );
    if (cardBlockers.length) {
      return {
        blockers: [...blockers, ...cardBlockers.filter((blocker) => !blockers.includes(blocker))],
        snapshot,
        defaultTargetIntervalMonths,
        services,
        leftover,
      };
    }
  } catch {
    leftover = null;
  }

  return { blockers, snapshot, defaultTargetIntervalMonths, services, leftover };
}

export async function retargetTermAndCollectByCard(input: {
  subscriptionId: string;
  staffUserId: string;
  targetIntervalMonths: number;
  firstChargeDate?: string | null;
  invoiceDisposition: TermRetargetInvoiceDisposition | null;
  serviceAmounts: TermRetargetServiceAmount[];
  confirmChargeNow: boolean;
  confirmCancelExisting: boolean;
}): Promise<TermRetargetAndPayNowResult> {
  if (!input.confirmChargeNow) fail("CONFIRM_CHARGE_REQUIRED", "Confirm that Stripe will charge the new term today.");
  const snapshot = await loadSnapshot(input.subscriptionId);
  const firstChargeDate = input.firstChargeDate?.trim() || commercialDateString(new Date());
  const plan = planTermRetarget(snapshot, {
    targetIntervalMonths: input.targetIntervalMonths,
    firstChargeDate,
    invoiceDisposition: input.invoiceDisposition,
    serviceAmounts: input.serviceAmounts,
  });

  if (input.confirmCancelExisting === false) {
    try {
      const leftover = await inspectStripeCardOnFileReadiness(input.subscriptionId, "pay_now");
      if (leftover.requiresExplicitCancel) {
        fail("CONFIRM_CANCEL_REQUIRED", leftover.leftoverSummary ?? "Cancel leftover Stripe subscriptions before collecting a new card.");
      }
      if (leftover.blockers.some((blocker) => /already has a live subscription linked/i.test(blocker))) {
        fail("FOREIGN_STRIPE_SUBSCRIPTION", leftover.blockers[0]);
      }
    } catch (error) {
      if (error instanceof CanonicalSubscriptionValidationError) throw error;
    }
  }

  const moved = await retargetCanonicalSubscriptionTerm({
    plan,
    createdById: input.staffUserId,
  });

  const voidedNumbers = snapshot.openInvoices
    .filter((invoice) => moved.voidedInvoiceIds.includes(invoice.id) && invoice.number)
    .map((invoice) => invoice.number as string);

  await recordOperationalEvent({
    category: "subscription.term_retargeted",
    summary: `Agreement moved from ${cadenceLabel(plan.sourceIntervalMonths).toLowerCase()} to ${cadenceLabel(plan.targetIntervalMonths).toLowerCase()} so the customer can pay the new term by card.`,
    customerId: snapshot.customerId,
    actorUserId: input.staffUserId,
    payload: {
      sourceSubscriptionId: plan.sourceId,
      targetSubscriptionId: moved.targetSubscriptionId,
      sourceIntervalMonths: plan.sourceIntervalMonths,
      targetIntervalMonths: plan.targetIntervalMonths,
      cycleTotal: plan.cycleTotal,
      invoiceDisposition: plan.invoiceDisposition,
      voidedInvoiceIds: moved.voidedInvoiceIds,
      successorItemIds: moved.successorItemIds,
    },
  });

  let checkoutUrl: string | null = null;
  let notifySummary: string | null = null;
  let checkoutError: string | null = null;
  try {
    const checkout = await sendStaffPayNowCheckout({
      subscriptionId: moved.targetSubscriptionId,
      staffUserId: input.staffUserId,
      confirmChargeNow: true,
      confirmCancelExisting: input.confirmCancelExisting,
      confirmVoidOpenInvoices: false,
    });
    checkoutUrl = checkout.checkoutUrl;
    notifySummary = checkout.notifySummary;
  } catch (error) {
    if (
      error instanceof CanonicalCollectionProgramError
      || error instanceof CanonicalStripeCardOnFileError
      || error instanceof CanonicalSubscriptionValidationError
    ) {
      checkoutError = error.message;
    } else {
      checkoutError = error instanceof Error ? error.message : "Card Checkout could not be sent.";
    }
  }

  return {
    sourceSubscriptionId: plan.sourceId,
    targetSubscriptionId: moved.targetSubscriptionId,
    successorItemIds: moved.successorItemIds,
    voidedInvoiceNumbers: voidedNumbers,
    cycleTotal: plan.cycleTotal,
    targetIntervalMonths: plan.targetIntervalMonths,
    checkoutUrl,
    notifySummary,
    checkoutError,
  };
}

export type { TermRetargetPlan };
