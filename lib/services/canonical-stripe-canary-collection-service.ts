import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { stripeLinkBlockers } from "@/lib/domain/canonical-stripe-link";
import { syncCustomerBillingModeFromSubscriptions } from "@/lib/services/canonical-stripe-link-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

/**
 * Collection-method steps around the single-subscription live canary, where TL Portal itself
 * (not a person in the Stripe Dashboard) creates the Stripe subscription. The canary only
 * accepts a subscription already marked Stripe auto-charge, so the subscription must be
 * switched first, and switched back if the customer never completes Checkout.
 *
 *  - convert:  Recurring invoices -> Stripe auto-charge; its recurring invoice schedules are
 *              PAUSED (not ended) so they can be restored.
 *  - revert:   Stripe auto-charge -> Recurring invoices; resumes exactly the schedules that
 *              convert paused. Only while no Stripe relationship exists.
 *  - finalize: after Stripe is live, ends the paused schedules and settles the customer flag.
 *
 * None of these calls Stripe, creates an invoice, records a payment or notifies a customer.
 */

export class CanaryCollectionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CanaryCollectionError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new CanaryCollectionError(code, message);
}

const CONVERTED = "subscription.canary_collection_converted";
const REVERTED = "subscription.canary_collection_reverted";
const FINALIZED = "subscription.canary_collection_finalized";

async function lockedSubscription(tx: Prisma.TransactionClient, subscriptionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      customerId: true,
      controlMode: true,
      lifecycleStatus: true,
      collectionMethod: true,
      billingIntervalMonths: true,
      billingAnchorDate: true,
      nextBillingDate: true,
      items: { select: { status: true, rates: { select: { id: true } } } },
      providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } },
    },
  });
  if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  return subscription;
}

export async function convertSubscriptionToStripeCollectionForCanary(subscriptionId: string): Promise<{
  customerId: string;
  pausedScheduleIds: string[];
}> {
  const outcome = await prisma.$transaction(async (tx) => {
    const subscription = await lockedSubscription(tx, subscriptionId);
    const blockers = stripeLinkBlockers({
      controlMode: subscription.controlMode,
      lifecycleStatus: subscription.lifecycleStatus,
      collectionMethod: subscription.collectionMethod,
      billingIntervalMonths: subscription.billingIntervalMonths,
      billingAnchorDate: subscription.billingAnchorDate,
      nextBillingDate: subscription.nextBillingDate,
      billableItemCount: subscription.items.filter((item) => !["ended", "canceled"].includes(item.status) && item.rates.length > 0).length,
      hasOpenStripeLink: subscription.providerLinks.length > 0,
    });
    if (blockers.length) fail("NOT_ELIGIBLE", blockers.join(" "));
    const priorCanary = await tx.billingOperation.findFirst({
      where: { operationKey: { startsWith: "canonical-stripe-live-canary:" } },
      select: { id: true },
    });
    if (priorCanary) fail("CANARY_ALREADY_USED", "A live-canary operation already exists; the canary is single-use.");

    const schedules = await tx.recurringInvoiceSchedule.findMany({
      where: { customerSubscriptionId: subscriptionId, status: "active" },
      select: { id: true },
    });
    if (schedules.length) {
      await tx.recurringInvoiceSchedule.updateMany({
        where: { id: { in: schedules.map((entry) => entry.id) } },
        data: { status: "paused" },
      });
    }
    await tx.customerSubscription.update({
      where: { id: subscriptionId },
      data: { collectionMethod: "stripe_autocharge" },
    });
    return { customerId: subscription.customerId, pausedScheduleIds: schedules.map((entry) => entry.id) };
  });
  await recordOperationalEvent({
    category: CONVERTED,
    summary: "Subscription switched to Stripe collection for the live canary; recurring invoice schedules paused.",
    customerId: outcome.customerId,
    payload: { subscriptionId, pausedScheduleIds: outcome.pausedScheduleIds },
  });
  return outcome;
}

export async function revertCanaryCollectionToRecurringInvoices(subscriptionId: string, options: { allowLateSchedules?: boolean } = {}): Promise<{
  customerId: string;
  resumedScheduleIds: string[];
}> {
  const outcome = await prisma.$transaction(async (tx) => {
    const subscription = await lockedSubscription(tx, subscriptionId);
    if (subscription.collectionMethod !== "stripe_autocharge") {
      fail("NOT_STRIPE_COLLECTED", "This subscription is not collected by Stripe, so there is nothing to revert.");
    }
    if (subscription.providerLinks.length > 0) {
      fail("STRIPE_RELATIONSHIP_EXISTS", "A Stripe subscription already exists for this subscription. Cancel it in Stripe first; reverting would bill the customer twice.");
    }
    const started = await tx.billingOperation.findFirst({
      where: {
        customerSubscriptionId: subscriptionId,
        operationKey: { startsWith: "canonical-stripe-live-canary:" },
        providerSubscriptionReference: { not: null },
      },
      select: { id: true },
    });
    if (started) fail("STRIPE_RELATIONSHIP_EXISTS", "The canary already created a Stripe subscription. Revert is no longer safe.");

    const event = await tx.operationalEvent.findFirst({
      where: { category: CONVERTED, customerId: subscription.customerId },
      orderBy: { occurredAt: "desc" },
      select: { payload: true },
    });
    const payload = event?.payload as { subscriptionId?: string; pausedScheduleIds?: string[] } | null;
    const ids = payload?.subscriptionId === subscriptionId && Array.isArray(payload.pausedScheduleIds) ? payload.pausedScheduleIds : [];
    const schedules = ids.length
      ? await tx.recurringInvoiceSchedule.findMany({
        where: { id: { in: ids }, customerSubscriptionId: subscriptionId, status: "paused" },
        select: { id: true, nextIssueDate: true },
      })
      : [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (!options.allowLateSchedules && schedules.some((entry) => entry.nextIssueDate.getTime() < today.getTime())) {
      fail("SCHEDULE_OVERDUE", "A paused invoice schedule is now overdue; resuming it would issue an invoice immediately. Review the dates first.");
    }
    if (schedules.length) {
      await tx.recurringInvoiceSchedule.updateMany({
        where: { id: { in: schedules.map((entry) => entry.id) } },
        data: { status: "active" },
      });
    }
    await tx.customerSubscription.update({ where: { id: subscriptionId }, data: { collectionMethod: "manual_invoice" } });
    return { customerId: subscription.customerId, resumedScheduleIds: schedules.map((entry) => entry.id) };
  });
  await recordOperationalEvent({
    category: REVERTED,
    summary: "Live canary abandoned before Stripe was created; subscription returned to recurring invoices.",
    customerId: outcome.customerId,
    payload: { subscriptionId, resumedScheduleIds: outcome.resumedScheduleIds },
  });
  return outcome;
}

export async function finalizeCanaryCollection(subscriptionId: string): Promise<{
  customerId: string;
  endedScheduleCount: number;
  billingModeChanged: boolean;
}> {
  const outcome = await prisma.$transaction(async (tx) => {
    const subscription = await lockedSubscription(tx, subscriptionId);
    if (subscription.collectionMethod !== "stripe_autocharge" || subscription.providerLinks.length === 0) {
      fail("STRIPE_NOT_LIVE", "Finalize only applies once the Stripe subscription exists and is linked.");
    }
    const ended = await tx.recurringInvoiceSchedule.updateMany({
      where: { customerSubscriptionId: subscriptionId, status: { in: ["active", "paused"] } },
      data: { status: "ended" },
    });
    const mode = await syncCustomerBillingModeFromSubscriptions(subscription.customerId, tx);
    return { customerId: subscription.customerId, endedScheduleCount: ended.count, billingModeChanged: mode.changed };
  });
  await recordOperationalEvent({
    category: FINALIZED,
    summary: "Live canary Stripe collection confirmed; recurring invoice schedules ended.",
    customerId: outcome.customerId,
    payload: { subscriptionId, endedScheduleCount: outcome.endedScheduleCount, billingModeChanged: outcome.billingModeChanged },
  });
  return outcome;
}
