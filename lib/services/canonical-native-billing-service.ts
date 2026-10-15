import "server-only";

import { Prisma, type SubscriptionCollectionHealth } from "@prisma/client";

import { addUtcMonths, startOfUtcDay } from "@/lib/billing/recurring-period";
import { prisma } from "@/lib/db";
import {
  assertCanonicalNativeBillingExecutionEnabled,
  CanonicalNativeBillingError,
  deriveCanonicalCollectionHealth,
  resolveCanonicalBillingCycle,
  type CanonicalBillingCycle,
  type CanonicalNativeBillingEnvironment,
} from "@/lib/domain/canonical-native-billing";

const canonicalConfigurationInclude = {
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] } },
  },
} satisfies Prisma.CustomerSubscriptionInclude;

type CanonicalBillingTransaction = Pick<
  Prisma.TransactionClient,
  "customerSubscription" | "recurringInvoiceSchedule" | "invoice" | "invoiceLineItem" | "invoiceServiceSnapshot"
>;

export type CanonicalScheduleBillingCycle = CanonicalBillingCycle & {
  subscriptionId: string;
  customerId: string;
  scheduleId: string;
  periodEnd: Date;
};

function error(code: string, message: string): never {
  throw new CanonicalNativeBillingError(code, message);
}

function sameUtcDay(left: Date, right: Date): boolean {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

export function canonicalRecurringGenerationKey(subscriptionId: string, issueDate: Date): string {
  return `canonical:${subscriptionId}:${startOfUtcDay(issueDate).toISOString()}`;
}

/**
 * Resolve and validate a canonical native schedule inside the caller's locked transaction.
 * This performs no writes and is also the authoritative financial preview used by generation.
 */
export async function resolveCanonicalScheduleBillingCycle(
  tx: CanonicalBillingTransaction,
  input: {
    scheduleId: string;
    periodStart: Date;
    environment?: CanonicalNativeBillingEnvironment;
  },
): Promise<CanonicalScheduleBillingCycle> {
  assertCanonicalNativeBillingExecutionEnabled(input.environment);
  const schedule = await tx.recurringInvoiceSchedule.findUnique({
    where: { id: input.scheduleId },
    include: {
      customerSubscription: { include: canonicalConfigurationInclude },
    },
  });
  if (!schedule) error("SCHEDULE_NOT_FOUND", "Recurring schedule not found.");
  if (schedule.status !== "active") error("SCHEDULE_NOT_ACTIVE", "Recurring schedule is not active.");
  if (!sameUtcDay(schedule.nextIssueDate, input.periodStart)) {
    error("SCHEDULE_DATE_MISMATCH", "The requested billing period must match the schedule's next issue date.");
  }
  const subscription = schedule.customerSubscription;
  if (!subscription) {
    error("SUBSCRIPTION_NOT_LINKED", "Canonical recurring billing requires an exact subscription link.");
  }
  if (subscription.controlMode !== "canonical") {
    error("CANONICAL_CONTROL_REQUIRED", "Only explicitly canonical-controlled subscriptions may generate canonical invoices.");
  }
  if (subscription.collectionMethod !== "manual_invoice") {
    error("WRONG_COLLECTION_METHOD", "Canonical native invoices require manual invoice collection.");
  }
  if (schedule.customerId !== subscription.customerId) {
    error("CUSTOMER_MISMATCH", "The recurring schedule and subscription belong to different customers.");
  }
  if (
    subscription.billingIntervalMonths == null
    || schedule.intervalMonths !== subscription.billingIntervalMonths
  ) {
    error("INTERVAL_MISMATCH", "The recurring schedule interval must match the subscription interval.");
  }
  if (!subscription.currency || schedule.currency.toUpperCase() !== subscription.currency.toUpperCase()) {
    error("CURRENCY_MISMATCH", "The recurring schedule currency must match the subscription currency.");
  }
  if (!subscription.nextBillingDate || !sameUtcDay(subscription.nextBillingDate, input.periodStart)) {
    error("BILLING_DATE_MISMATCH", "The schedule period must match the subscription's next billing date.");
  }

  const cycle = resolveCanonicalBillingCycle(subscription, startOfUtcDay(input.periodStart));
  return {
    ...cycle,
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    scheduleId: schedule.id,
    periodEnd: addUtcMonths(startOfUtcDay(input.periodStart), cycle.billingIntervalMonths),
  };
}

/** Persist immutable item/rate attribution after invoice lines are created. */
export async function persistCanonicalInvoiceSnapshots(
  tx: CanonicalBillingTransaction,
  invoiceId: string,
  cycle: CanonicalScheduleBillingCycle,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { customerSubscriptionId: true, currency: true, subtotal: true },
  });
  if (!invoice) error("INVOICE_NOT_FOUND", "Canonical invoice was not created.");
  if (invoice.customerSubscriptionId !== cycle.subscriptionId) {
    error("INVOICE_ATTRIBUTION_MISMATCH", "Invoice subscription attribution does not match its billing cycle.");
  }
  if (invoice.currency.toUpperCase() !== cycle.currency || !invoice.subtotal.equals(cycle.subtotal)) {
    error("INVOICE_FINANCIAL_MISMATCH", "Invoice amounts do not match the resolved contractual cycle.");
  }

  const lineItems = await tx.invoiceLineItem.findMany({
    where: { invoiceId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true },
  });
  if (lineItems.length !== cycle.lines.length) {
    error("INVOICE_LINE_MISMATCH", "Invoice line count does not match the resolved subscription items.");
  }

  const snapshots = cycle.lines.map((line, index) => {
    const invoiceLine = lineItems[index];
    if (
      invoiceLine.description !== line.description
      || !invoiceLine.quantity.equals(line.quantity)
      || !invoiceLine.unitPrice.equals(line.agreedAmountPerCycle)
      || !invoiceLine.lineTotal.equals(line.billedAmount)
    ) {
      error("INVOICE_LINE_MISMATCH", `Invoice line ${index + 1} does not match its subscription item rate.`);
    }
    return {
      invoiceId,
      invoiceLineItemId: invoiceLine.id,
      subscriptionItemId: line.subscriptionItemId,
      subscriptionItemRateId: line.subscriptionItemRateId,
      serviceLabelSnapshot: line.description,
      agreedAmountPerCycleSnapshot: line.agreedAmountPerCycle,
      billedAmount: line.billedAmount,
      currency: line.currency,
      servicePeriodStart: cycle.periodStart,
      servicePeriodEnd: cycle.periodEnd,
      quantity: line.quantity,
      allocationNotes: `${cycle.billingIntervalMonths}-month canonical recurring cycle`,
    };
  });

  await tx.invoiceServiceSnapshot.createMany({ data: snapshots, skipDuplicates: true });
  const persisted = await tx.invoiceServiceSnapshot.count({
    where: {
      invoiceId,
      subscriptionItemId: { in: cycle.lines.map((line) => line.subscriptionItemId) },
    },
  });
  if (persisted !== cycle.lines.length) {
    error("SNAPSHOT_PERSISTENCE_MISMATCH", "Canonical invoice service snapshots are incomplete.");
  }
}

export async function previewCanonicalSubscriptionCycle(
  subscriptionId: string,
  periodStart: Date,
): Promise<CanonicalBillingCycle> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: canonicalConfigurationInclude,
  });
  if (!subscription) error("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  return resolveCanonicalBillingCycle(
    subscription,
    startOfUtcDay(periodStart),
    { requireActive: false },
  );
}

export type CanonicalBillingSummaryItem = {
  subscriptionItemId: string;
  subscriptionItemRateId: string;
  label: string;
  classification: "standard" | "negotiated";
  agreedAmountPerCycle: string;
  currency: string;
};

export type CanonicalSubscriptionBillingSummary = {
  subscriptionId: string;
  customerId: string;
  name: string | null;
  controlMode: "legacy" | "shadow" | "canonical";
  lifecycleStatus: string | null;
  collectionMethod: string | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  nextBillingDate: Date | null;
  recurringCycleTotal: string | null;
  outstandingBalance: string;
  collectionHealth: SubscriptionCollectionHealth;
  gracePeriodDays: number;
  gracePeriodExceeded: boolean;
  attentionRequired: boolean;
  earliestPastDueDate: Date | null;
  activeScheduleId: string | null;
  executionEnabled: boolean;
  eligibleForExecution: boolean;
  validationIssues: { code: string; message: string }[];
  items: CanonicalBillingSummaryItem[];
};

/** Read model for future admin UI; all amounts come from the same resolver used at issuance. */
export async function getCanonicalSubscriptionBillingSummary(
  subscriptionId: string,
  asOf = new Date(),
  environment: CanonicalNativeBillingEnvironment = process.env,
): Promise<CanonicalSubscriptionBillingSummary> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      ...canonicalConfigurationInclude,
      recurringSchedules: {
        where: { status: { not: "ended" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, status: true, intervalMonths: true, nextIssueDate: true, currency: true },
      },
      invoices: {
        where: {
          archivedAt: null,
          status: { notIn: ["draft", "void", "written_off"] },
        },
        select: { amountDue: true, dueDate: true },
      },
    },
  });
  if (!subscription) error("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");

  const collection = deriveCanonicalCollectionHealth({
    invoices: subscription.invoices,
    gracePeriodDays: subscription.gracePeriodDays,
    asOf,
  });
  const validationIssues: { code: string; message: string }[] = [];
  let cycle: CanonicalBillingCycle | null = null;
  if (!subscription.nextBillingDate) {
    validationIssues.push({ code: "NEXT_BILLING_DATE_MISSING", message: "Next billing date is required." });
  } else {
    try {
      cycle = resolveCanonicalBillingCycle(
        subscription,
        startOfUtcDay(subscription.nextBillingDate),
        { requireActive: false },
      );
    } catch (caught) {
      if (!(caught instanceof CanonicalNativeBillingError)) throw caught;
      validationIssues.push({ code: caught.code, message: caught.message });
    }
  }
  if (subscription.controlMode !== "canonical") {
    validationIssues.push({ code: "CANONICAL_CONTROL_REQUIRED", message: "Canonical billing control is not authorized." });
  }
  if (subscription.lifecycleStatus !== "active") {
    validationIssues.push({ code: "SUBSCRIPTION_NOT_ACTIVE", message: "Canonical execution requires an active commercial lifecycle." });
  }
  if (subscription.collectionMethod !== "manual_invoice") {
    validationIssues.push({ code: "WRONG_COLLECTION_METHOD", message: "Native recurring billing requires manual invoice collection." });
  }
  if (subscription.recurringSchedules.length !== 1) {
    validationIssues.push({
      code: subscription.recurringSchedules.length === 0 ? "SCHEDULE_MISSING" : "SCHEDULE_AMBIGUOUS",
      message: "Exactly one open recurring schedule must belong to the subscription.",
    });
  } else if (cycle) {
    const schedule = subscription.recurringSchedules[0];
    if (
      schedule.status !== "active"
      || schedule.intervalMonths !== cycle.billingIntervalMonths
      || schedule.currency.toUpperCase() !== cycle.currency
      || !subscription.nextBillingDate
      || !sameUtcDay(schedule.nextIssueDate, subscription.nextBillingDate)
    ) {
      validationIssues.push({ code: "SCHEDULE_MISMATCH", message: "Recurring schedule terms do not match the subscription." });
    }
  }

  const executionEnabled = environment.NODE_ENV !== "production"
    && environment.CANONICAL_NATIVE_BILLING_ENABLED === "true";
  return {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    name: subscription.name,
    controlMode: subscription.controlMode,
    lifecycleStatus: subscription.lifecycleStatus,
    collectionMethod: subscription.collectionMethod,
    billingIntervalMonths: subscription.billingIntervalMonths,
    currency: subscription.currency,
    nextBillingDate: subscription.nextBillingDate,
    recurringCycleTotal: cycle?.subtotal.toFixed(2) ?? null,
    outstandingBalance: collection.outstandingBalance.toFixed(2),
    collectionHealth: collection.status,
    gracePeriodDays: subscription.gracePeriodDays,
    gracePeriodExceeded: collection.gracePeriodExceeded,
    attentionRequired: collection.attentionRequired,
    earliestPastDueDate: collection.earliestPastDueDate,
    activeScheduleId: subscription.recurringSchedules[0]?.id ?? null,
    executionEnabled,
    eligibleForExecution: executionEnabled && validationIssues.length === 0,
    validationIssues,
    items: cycle?.lines.map((line) => ({
      subscriptionItemId: line.subscriptionItemId,
      subscriptionItemRateId: line.subscriptionItemRateId,
      label: line.description,
      classification: line.classification,
      agreedAmountPerCycle: line.agreedAmountPerCycle.toFixed(2),
      currency: line.currency,
    })) ?? [],
  };
}
