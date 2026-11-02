import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { CanonicalSubscriptionValidationError } from "@/lib/domain/canonical-subscription-application";
import {
  mergeBlockers,
  mergeCompatibilityKey,
  planSubscriptionMerge,
  type MergeSubscriptionSnapshot,
  type SubscriptionMergePlan,
} from "@/lib/domain/canonical-subscription-merge";

type Db = Prisma.TransactionClient | typeof prisma;

async function loadSnapshots(db: Db, where: Prisma.CustomerSubscriptionWhereInput): Promise<MergeSubscriptionSnapshot[]> {
  const rows = await db.customerSubscription.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      customerId: true,
      controlMode: true,
      lifecycleStatus: true,
      collectionMethod: true,
      billingIntervalMonths: true,
      currency: true,
      nextBillingDate: true,
      gracePeriodDays: true,
      canonicalMigrationLedger: { select: { id: true } },
      canonicalManualPilotActivation: { select: { id: true } },
      operationalActivation: { select: { initialInvoiceId: true } },
      items: {
        select: {
          id: true,
          status: true,
          initialAdjustment: { select: { invoiceId: true } },
          _count: { select: { invoiceSnapshots: true } },
        },
      },
      recurringSchedules: {
        where: { status: { not: "ended" } },
        select: {
          id: true,
          lastGeneratedAt: true,
          lastInvoiceId: true,
          dueDaysAfterIssue: true,
          autoEmail: true,
          emailTo: true,
          _count: { select: { generatedInvoices: true } },
        },
      },
      _count: { select: { invoices: true, billingInvoices: true, billingOperations: true, providerLinks: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    controlMode: row.controlMode,
    lifecycleStatus: row.lifecycleStatus,
    collectionMethod: row.collectionMethod,
    billingIntervalMonths: row.billingIntervalMonths,
    currency: row.currency,
    nextBillingDate: row.nextBillingDate,
    gracePeriodDays: row.gracePeriodDays,
    hasMigrationLedger: Boolean(row.canonicalMigrationLedger),
    hasPilotActivation: Boolean(row.canonicalManualPilotActivation),
    invoiceCount: row._count.invoices,
    billingInvoiceCount: row._count.billingInvoices,
    billingOperationCount: row._count.billingOperations,
    providerLinkCount: row._count.providerLinks,
    initialInvoiceId: row.operationalActivation?.initialInvoiceId ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      status: item.status,
      invoiceSnapshotCount: item._count.invoiceSnapshots,
      adjustmentInvoiceId: item.initialAdjustment?.invoiceId ?? null,
    })),
    schedules: row.recurringSchedules.map((schedule) => ({
      id: schedule.id,
      hasGeneratedInvoice: Boolean(schedule.lastGeneratedAt || schedule.lastInvoiceId || schedule._count.generatedInvoices),
      dueDaysAfterIssue: schedule.dueDaysAfterIssue,
      autoEmail: schedule.autoEmail,
      emailTo: schedule.emailTo,
    })),
  }));
}

export type MergeCandidate = {
  id: string;
  name: string | null;
  lifecycleStatus: string | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  nextBillingDate: Date | null;
  /** Subscriptions with the same key have identical terms and may be merged together. */
  key: string;
  /** Empty when the subscription can take part in a merge. */
  blockers: string[];
  liveServiceCount: number;
};

/** A customer's current subscriptions with the reason each can or cannot be merged. */
export async function listMergeCandidates(customerId: string): Promise<MergeCandidate[]> {
  const snapshots = await loadSnapshots(prisma, {
    customerId,
    controlMode: { not: "legacy" },
    lifecycleStatus: { notIn: ["ended", "canceled"] },
  });
  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    name: snapshot.name,
    lifecycleStatus: snapshot.lifecycleStatus,
    billingIntervalMonths: snapshot.billingIntervalMonths,
    currency: snapshot.currency,
    nextBillingDate: snapshot.nextBillingDate,
    key: mergeCompatibilityKey(snapshot),
    blockers: mergeBlockers(snapshot),
    liveServiceCount: snapshot.items.filter((item) => !["ended", "canceled"].includes(item.status)).length,
  }));
}

export type SubscriptionMergeResult = {
  plan: SubscriptionMergePlan;
  customerId: string;
};

/**
 * Folds `sourceIds` into `targetId`. Services move with their rates, hardware links, agreed
 * adjustments and history; the emptied subscriptions are retired and their recurring
 * schedules ended so the customer is invoiced once, from the target's schedule.
 *
 * Everything is re-read inside one serializable transaction, so a subscription that was
 * invoiced a moment ago is refused, not merged. It never creates, sends or collects an
 * invoice and never contacts a payment provider.
 */
export async function mergeSubscriptions(input: { targetId: string; sourceIds: string[] }): Promise<SubscriptionMergeResult> {
  const sourceIds = [...new Set(input.sourceIds.map((id) => id.trim()).filter(Boolean))];
  return prisma.$transaction(async (tx) => {
    const snapshots = await loadSnapshots(tx, { id: { in: [input.targetId, ...sourceIds] } });
    const target = snapshots.find((snapshot) => snapshot.id === input.targetId);
    if (!target) throw new CanonicalSubscriptionValidationError("SUBSCRIPTION_NOT_FOUND", "The target subscription was not found.");
    const sources = sourceIds.map((id) => {
      const found = snapshots.find((snapshot) => snapshot.id === id);
      if (!found) throw new CanonicalSubscriptionValidationError("SUBSCRIPTION_NOT_FOUND", "A subscription to merge was not found.");
      return found;
    });
    const plan = planSubscriptionMerge(target, sources);

    await tx.subscriptionItem.updateMany({
      where: { id: { in: plan.movedItemIds } },
      data: { customerSubscriptionId: plan.targetId },
    });
    await tx.recurringInvoiceSchedule.updateMany({
      where: { id: { in: plan.endedScheduleIds } },
      data: { status: "ended" },
    });
    // A never-activated draft is withdrawn; an activated subscription is closed out.
    await tx.customerSubscription.updateMany({
      where: { id: { in: plan.sourceIds } },
      data: { lifecycleStatus: target.lifecycleStatus === "draft" ? "canceled" : "ended" },
    });

    return { plan, customerId: target.customerId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
