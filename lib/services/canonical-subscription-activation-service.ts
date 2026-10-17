import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalSubscriptionActivationEnabled,
  type CanonicalSubscriptionActivationEnvironment,
} from "@/lib/domain/canonical-subscription-activation";
import {
  CanonicalSubscriptionValidationError,
  canonicalBillingInterval,
  normalizeCurrency,
} from "@/lib/domain/canonical-subscription-application";

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

/** Activate a local/test manual agreement and arm exactly one future native schedule.
 * It creates neither an invoice nor any email/WhatsApp delivery. */
export async function activateCanonicalManualSubscription(input: {
  subscriptionId: string;
  staffUserId?: string | null;
  environment?: CanonicalSubscriptionActivationEnvironment;
}): Promise<{ scheduleId: string; reused: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${input.subscriptionId} FOR UPDATE`;
    const subscription = await tx.customerSubscription.findUnique({
      where: { id: input.subscriptionId },
      include: { items: { include: { rates: true } }, recurringSchedules: { where: { status: { not: "ended" } } } },
    });
    if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Canonical subscription not found.");
    assertCanonicalSubscriptionActivationEnabled(input.environment, {
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
    });
    if (subscription.controlMode !== "canonical" || subscription.collectionMethod !== "manual_invoice") {
      fail("MANUAL_CANONICAL_REQUIRED", "Only a canonical manual-invoice subscription can be activated here.");
    }
    if (subscription.lifecycleStatus === "active" && subscription.recurringSchedules.length === 1) {
      return { scheduleId: subscription.recurringSchedules[0].id, reused: true };
    }
    if (subscription.lifecycleStatus !== "draft" && subscription.lifecycleStatus !== "pending_activation") {
      fail("INVALID_LIFECYCLE", "Only a draft or pending canonical subscription can be activated.");
    }
    if (!subscription.nextBillingDate || !subscription.billingIntervalMonths || !subscription.currency) {
      fail("INCOMPLETE_SUBSCRIPTION", "Billing date, interval, and currency are required before activation.");
    }
    const interval = canonicalBillingInterval(subscription.billingIntervalMonths);
    const billable = subscription.items.filter((item) => item.status !== "ended" && item.status !== "canceled");
    if (!billable.length) fail("SUBSCRIPTION_HAS_NO_ITEMS", "Activation requires at least one billable service.");
    for (const item of billable) {
      if (!item.serviceActivatedDate || !item.billingEffectiveFrom) {
        fail("INCOMPLETE_ITEM", "Every activated service requires activation and billing-effective dates.");
      }
      const rates = item.rates.filter((rate) => rate.billingIntervalMonths === interval && normalizeCurrency(rate.currency) === normalizeCurrency(subscription.currency!));
      if (rates.length !== 1) fail("ITEM_RATE_AMBIGUOUS", "Every activated service needs exactly one effective cycle rate.");
    }
    if (subscription.recurringSchedules.length > 1) fail("SCHEDULE_OWNERSHIP_AMBIGUOUS", "More than one open recurring schedule owns this subscription.");
    const schedule = subscription.recurringSchedules[0] ?? await tx.recurringInvoiceSchedule.create({
      data: {
        status: "active",
        name: subscription.name ?? "Canonical tracking subscription",
        customerId: subscription.customerId,
        customerSubscriptionId: subscription.id,
        currency: normalizeCurrency(subscription.currency),
        intervalMonths: interval,
        nextIssueDate: subscription.nextBillingDate,
        dueDaysAfterIssue: subscription.gracePeriodDays,
        autoEmail: false,
        createdById: input.staffUserId ?? null,
        lineItems: { create: billable.map((item, sortOrder) => ({
          sortOrder,
          description: item.label?.trim() || "Tracking service",
          quantity: 1,
          unitPrice: item.rates.find((rate) => rate.billingIntervalMonths === interval)!.agreedAmountPerCycle,
          lineTotal: item.rates.find((rate) => rate.billingIntervalMonths === interval)!.agreedAmountPerCycle,
        })) },
      },
      select: { id: true },
    });
    await tx.customerSubscription.update({ where: { id: subscription.id }, data: { lifecycleStatus: "active", status: "active", collectionHealth: "not_started" } });
    await tx.subscriptionItem.updateMany({ where: { customerSubscriptionId: subscription.id, status: { in: ["draft", "pending_activation"] } }, data: { status: "active" } });
    return { scheduleId: schedule.id, reused: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
