import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  planBillingDateCorrection,
  type BillingDateCorrectionPlan,
  type BillingDateCorrectionSnapshot,
} from "@/lib/domain/canonical-billing-date-correction";
import { CanonicalSubscriptionValidationError, commercialDate } from "@/lib/domain/canonical-subscription-application";

export type BillingDateCorrectionResult = {
  plan: BillingDateCorrectionPlan;
  scheduleCount: number;
  assignmentCount: number;
};

/**
 * Corrects a canonical subscription's start and renewal dates, moving every record that
 * copied them (services, service rates, the derived recurring schedule and the installed
 * devices' due dates) in one serializable transaction. Everything is re-read inside the
 * transaction, so a subscription that was invoiced a moment ago is refused, not edited.
 * It never creates, sends or collects an invoice and never contacts a payment provider.
 */
export async function correctSubscriptionBillingDates(input: {
  subscriptionId: string;
  commercialStartDate: string;
  nextBillingDate: string;
}): Promise<BillingDateCorrectionResult> {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.customerSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        id: true,
        controlMode: true,
        lifecycleStatus: true,
        collectionMethod: true,
        billingIntervalMonths: true,
        commercialStartDate: true,
        billingAnchorDate: true,
        nextBillingDate: true,
        operationalActivation: { select: { initialInvoiceId: true } },
        items: {
          select: {
            id: true,
            label: true,
            serviceActivatedDate: true,
            billingEffectiveFrom: true,
            initialAdjustment: { select: { id: true } },
            _count: { select: { invoiceSnapshots: true } },
          },
        },
        recurringSchedules: {
          where: { status: { not: "ended" } },
          select: { id: true, lastGeneratedAt: true, lastInvoiceId: true, _count: { select: { generatedInvoices: true } } },
        },
        _count: { select: { invoices: true, billingInvoices: true, billingOperations: true, providerLinks: true } },
      },
    });
    if (!subscription) throw new CanonicalSubscriptionValidationError("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");

    const snapshot: BillingDateCorrectionSnapshot = {
      controlMode: subscription.controlMode,
      lifecycleStatus: subscription.lifecycleStatus,
      collectionMethod: subscription.collectionMethod,
      billingIntervalMonths: subscription.billingIntervalMonths,
      commercialStartDate: subscription.commercialStartDate,
      billingAnchorDate: subscription.billingAnchorDate,
      nextBillingDate: subscription.nextBillingDate,
      invoiceCount: subscription._count.invoices,
      billingInvoiceCount: subscription._count.billingInvoices,
      billingOperationCount: subscription._count.billingOperations,
      providerLinkCount: subscription._count.providerLinks,
      initialInvoiceId: subscription.operationalActivation?.initialInvoiceId ?? null,
      items: subscription.items.map((item) => ({
        id: item.id,
        label: item.label,
        serviceActivatedDate: item.serviceActivatedDate,
        billingEffectiveFrom: item.billingEffectiveFrom,
        hasInitialAdjustment: Boolean(item.initialAdjustment),
        invoiceSnapshotCount: item._count.invoiceSnapshots,
      })),
      schedules: subscription.recurringSchedules.map((schedule) => ({
        id: schedule.id,
        hasGeneratedInvoice: Boolean(schedule.lastGeneratedAt || schedule.lastInvoiceId || schedule._count.generatedInvoices),
      })),
    };
    const plan = planBillingDateCorrection(snapshot, {
      commercialStartDate: input.commercialStartDate,
      nextBillingDate: input.nextBillingDate,
    });

    const oldStart = commercialDate(plan.previous.commercialStartDate, "Start date");
    const oldNext = commercialDate(plan.previous.nextBillingDate, "Next renewal date");
    const newStart = commercialDate(plan.next.commercialStartDate, "Start date");
    const newNext = commercialDate(plan.next.nextBillingDate, "Next renewal date");
    const itemIds = subscription.items.map((item) => item.id);

    await tx.customerSubscription.update({
      where: { id: subscription.id },
      data: {
        commercialStartDate: newStart,
        billingAnchorDate: commercialDate(plan.next.billingAnchorDate, "Billing anchor date"),
        nextBillingDate: newNext,
      },
    });

    for (const item of plan.items) {
      if (!item.serviceActivatedDate && !item.billingEffectiveFrom) continue;
      await tx.subscriptionItem.update({
        where: { id: item.id },
        data: {
          ...(item.serviceActivatedDate ? { serviceActivatedDate: commercialDate(item.serviceActivatedDate, "Service start") } : {}),
          ...(item.billingEffectiveFrom ? { billingEffectiveFrom: commercialDate(item.billingEffectiveFrom, "Billing start") } : {}),
        },
      });
    }
    // A rate that began on the old start date began with the agreement; deliberate later rates stay.
    await tx.subscriptionItemRate.updateMany({
      where: { subscriptionItemId: { in: itemIds }, effectiveFrom: oldStart },
      data: { effectiveFrom: newStart },
    });

    // The recurring invoice schedule is derived from the subscription, so it follows the renewal date.
    const schedules = await tx.recurringInvoiceSchedule.updateMany({
      where: { customerSubscriptionId: subscription.id, status: { not: "ended" } },
      data: { nextIssueDate: newNext },
    });
    // Installed devices carry the same due date as their service. Assignment due dates are
    // stored at UTC noon, so match the old calendar day and write the new one at noon too.
    const DAY_MS = 86_400_000;
    const assignments = await tx.serviceAssignment.updateMany({
      where: {
        subscriptionItemId: { in: itemIds },
        endDate: null,
        status: { not: "cancelled" },
        nextDueDate: { gte: oldNext, lt: new Date(oldNext.getTime() + DAY_MS) },
      },
      data: { nextDueDate: new Date(newNext.getTime() + DAY_MS / 2) },
    });

    return { plan, scheduleCount: schedules.count, assignmentCount: assignments.count };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
