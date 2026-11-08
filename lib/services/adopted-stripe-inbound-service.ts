import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import {
  decideAdoptedRenewalAdvance,
  utcDayString,
  type AdoptedRenewalDecision,
} from "@/lib/domain/adopted-stripe-renewal";
import { canonicalStripeExecutionEnabled } from "@/lib/domain/canonical-stripe-execution";
import { findCanonicalStripeOperationForWebhook } from "@/lib/services/canonical-stripe-execution-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { stripeInvoiceSubscriptionId } from "@/lib/stripe/invoice-subscription";

/**
 * INBOUND-ONLY handling for Stripe subscriptions adopted into the canonical model.
 *
 * Canonical Stripe *execution* (creating or changing things in Stripe) stays off in
 * production. That switch must not also stop TL Portal from listening: Stripe collects
 * the money, and these helpers only record what Stripe reports in our own database.
 * Nothing here calls Stripe to change anything, and every write is idempotent.
 */

export type AdoptedStripeSubscription = {
  /** CustomerSubscription id. */
  id: string;
  customerId: string;
  providerLinkId: string;
  billingIntervalMonths: number | null;
};

const INBOUND_EVENT_TYPES = new Set([
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * The adopted canonical subscription that owns this Stripe subscription, or null.
 * Anything TL Portal itself created in Stripe (a canonical operation) is excluded:
 * those stay with the canonical handler and its own guards.
 */
export async function findAdoptedStripeSubscription(
  externalSubscriptionId: string,
): Promise<AdoptedStripeSubscription | null> {
  const link = await prisma.subscriptionProviderLink.findFirst({
    where: {
      provider: "stripe",
      externalSubscriptionId,
      endedAt: null,
      customerSubscription: { controlMode: "canonical", collectionMethod: "stripe_autocharge" },
    },
    select: {
      id: true,
      customerSubscription: { select: { id: true, customerId: true, billingIntervalMonths: true } },
    },
  });
  if (!link) return null;
  if (await findCanonicalStripeOperationForWebhook({ externalSubscriptionId })) return null;
  return {
    id: link.customerSubscription.id,
    customerId: link.customerSubscription.customerId,
    providerLinkId: link.id,
    billingIntervalMonths: link.customerSubscription.billingIntervalMonths,
  };
}

function stripeSubscriptionIdForInboundEvent(event: Stripe.Event): string | null {
  if (!INBOUND_EVENT_TYPES.has(event.type)) return null;
  if (event.type.startsWith("invoice.")) {
    return stripeInvoiceSubscriptionId(event.data.object as Stripe.Invoice);
  }
  return (event.data.object as Stripe.Subscription).id ?? null;
}

/**
 * Returns the adopted subscription when this event should take the inbound-only path:
 * canonical execution is disabled, and the event belongs to an adopted subscription.
 * When execution is enabled (non-production), the canonical handler owns the event.
 */
export async function resolveAdoptedInboundEvent(
  event: Stripe.Event,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AdoptedStripeSubscription | null> {
  if (canonicalStripeExecutionEnabled(environment)) return null;
  const externalSubscriptionId = stripeSubscriptionIdForInboundEvent(event);
  if (!externalSubscriptionId) return null;
  return findAdoptedStripeSubscription(externalSubscriptionId);
}

export type ApplyPaidInvoiceResult = {
  decision: AdoptedRenewalDecision;
  assignmentsUpdated: number;
};

/**
 * Record a paid Stripe invoice against an adopted subscription: move the next billing
 * date forward one cycle and bring the linked device renewals with it.
 *
 * Idempotent and order-safe (see `decideAdoptedRenewalAdvance`), and serialised per
 * subscription so a webhook and the daily catch-up cannot both advance.
 */
export async function applyPaidStripeInvoiceToAdoptedSubscription(input: {
  subscriptionId: string;
  billingInvoiceId: string;
}): Promise<ApplyPaidInvoiceResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${input.subscriptionId} FOR UPDATE`;
    const subscription = await tx.customerSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: { id: true, customerId: true, controlMode: true, billingIntervalMonths: true, nextBillingDate: true },
    });
    const invoice = await tx.billingInvoice.findUnique({
      where: { id: input.billingInvoiceId },
      select: { customerId: true, status: true, externalInvoiceId: true, periodStart: true, periodEnd: true },
    });

    if (!subscription || subscription.controlMode !== "canonical") {
      return { customerId: null, invoiceRef: null, previous: null, assignmentsUpdated: 0, decision: { action: "review", reason: "The subscription is not a canonical subscription." } satisfies AdoptedRenewalDecision };
    }
    if (!invoice || invoice.customerId !== subscription.customerId || invoice.status.toLowerCase() !== "paid") {
      return { customerId: subscription.customerId, invoiceRef: invoice?.externalInvoiceId ?? null, previous: null, assignmentsUpdated: 0, decision: { action: "review", reason: "The invoice is not a paid invoice for this customer." } satisfies AdoptedRenewalDecision };
    }

    const previous = utcDayString(subscription.nextBillingDate);
    const decision = decideAdoptedRenewalAdvance({
      currentNextBillingDate: previous,
      billingIntervalMonths: subscription.billingIntervalMonths,
      invoicePeriodStart: utcDayString(invoice.periodStart),
      invoicePeriodEnd: utcDayString(invoice.periodEnd),
    });

    let assignmentsUpdated = 0;
    if (decision.action === "advance") {
      await tx.customerSubscription.update({
        where: { id: subscription.id },
        data: { nextBillingDate: new Date(`${decision.nextBillingDate}T00:00:00.000Z`), collectionHealth: "current" },
      });
      // Device renewals use UTC noon so a local-time display never slips to the day before.
      const dueDate = new Date(`${decision.nextBillingDate}T12:00:00.000Z`);
      const updated = await tx.serviceAssignment.updateMany({
        where: {
          subscriptionItem: { customerSubscriptionId: subscription.id },
          endDate: null,
          status: { in: ["active", "due_soon", "overdue"] },
          OR: [{ nextDueDate: null }, { nextDueDate: { lt: dueDate } }],
        },
        data: {
          nextDueDate: dueDate,
          status: "active",
          lastPaymentStatus: "paid (Stripe)",
          lastInvoiceId: invoice.externalInvoiceId,
        },
      });
      assignmentsUpdated = updated.count;
    }
    return { customerId: subscription.customerId, invoiceRef: invoice.externalInvoiceId, previous, assignmentsUpdated, decision };
  });

  if (outcome.customerId) {
    if (outcome.decision.action === "advance") {
      await recordOperationalEvent({
        category: "renewal.paid",
        summary: `Renewal advanced to ${outcome.decision.nextBillingDate} from Stripe payment`,
        customerId: outcome.customerId,
        payload: {
          source: "stripe_inbound",
          subscriptionId: input.subscriptionId,
          stripeInvoiceId: outcome.invoiceRef,
          previousNextBillingDate: outcome.previous,
          nextBillingDate: outcome.decision.nextBillingDate,
          assignmentsUpdated: outcome.assignmentsUpdated,
        },
      });
    } else if (outcome.decision.action === "review") {
      await recordOperationalEvent({
        category: "billing.reconciliation_required",
        summary: "Stripe payment received but the renewal date was not advanced — review",
        customerId: outcome.customerId,
        payload: {
          source: "stripe_inbound",
          subscriptionId: input.subscriptionId,
          stripeInvoiceId: outcome.invoiceRef,
          reason: outcome.decision.reason,
        },
      });
    }
  }
  return { decision: outcome.decision, assignmentsUpdated: outcome.assignmentsUpdated };
}

/**
 * Daily catch-up for missed webhooks: apply mirrored paid invoices to adopted
 * subscriptions, oldest period first so several missed cycles resolve in one pass.
 */
export async function applyMirroredPaidInvoicesToAdoptedSubscriptions(
  billingInvoiceIds: string[],
): Promise<{ checked: number; advanced: number; errors: string[] }> {
  const result = { checked: 0, advanced: 0, errors: [] as string[] };
  if (billingInvoiceIds.length === 0) return result;

  const invoices = await prisma.billingInvoice.findMany({
    where: {
      id: { in: billingInvoiceIds },
      provider: "stripe",
      status: { equals: "paid", mode: "insensitive" },
      stripeSubscriptionId: { not: null },
    },
    orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
    select: { id: true, externalInvoiceId: true, stripeSubscriptionId: true },
  });

  for (const invoice of invoices) {
    try {
      const adopted = await findAdoptedStripeSubscription(invoice.stripeSubscriptionId!);
      if (!adopted) continue;
      result.checked += 1;
      const applied = await applyPaidStripeInvoiceToAdoptedSubscription({
        subscriptionId: adopted.id,
        billingInvoiceId: invoice.id,
      });
      if (applied.decision.action === "advance") result.advanced += 1;
    } catch (e) {
      result.errors.push(`${invoice.externalInvoiceId}: ${e instanceof Error ? e.message : "renewal apply failed"}`);
    }
  }
  return result;
}

/** Local-only bookkeeping of what Stripe reports about an adopted subscription. */
export async function recordAdoptedSubscriptionState(
  adopted: AdoptedStripeSubscription,
  subscription: Stripe.Subscription,
  eventType: string,
): Promise<void> {
  await prisma.subscriptionProviderLink.update({
    where: { id: adopted.providerLinkId },
    data: { providerStatus: subscription.status, lastSyncedAt: new Date(), lastError: null },
  });
  await prisma.billingAccount.updateMany({
    where: { customerId: adopted.customerId, provider: "stripe" },
    data: { status: subscription.status },
  });
  const needsStaffEyes =
    eventType === "customer.subscription.deleted" || ["past_due", "unpaid", "canceled", "incomplete_expired"].includes(subscription.status);
  if (needsStaffEyes) {
    await recordOperationalEvent({
      category: "billing.synced",
      summary: eventType === "customer.subscription.deleted" ? "Stripe subscription canceled" : `Stripe subscription ${subscription.status}`,
      customerId: adopted.customerId,
      payload: { source: "stripe_inbound", subscriptionId: adopted.id, stripeSubscriptionId: subscription.id, status: subscription.status },
    });
  }
}

export async function markAdoptedSubscriptionPastDue(adopted: AdoptedStripeSubscription): Promise<void> {
  await prisma.customerSubscription.update({ where: { id: adopted.id }, data: { collectionHealth: "past_due" } });
}
