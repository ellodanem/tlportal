/**
 * Pure rules for merging several canonical subscriptions of one customer into one.
 *
 * Typical cause: devices were migrated one at a time, so a customer ended up with N
 * single-service subscriptions that all renew on the same day on the same plan. Each of
 * those would issue its own invoice; merged, the customer gets one invoice with N lines.
 *
 * For canonical subscriptions the invoice lines are derived from the subscription's
 * services at generation time, so a merge only has to move the services (their rates,
 * hardware links, adjustments and history travel with them) onto the surviving
 * subscription and retire the emptied ones together with their recurring schedules.
 *
 * To keep this a safe, reversible-by-inspection operation it is limited to subscriptions
 * that are indistinguishable commercially (same customer, cadence, currency, renewal
 * date, collection method, lifecycle and grace period) and that have never been billed.
 * Anything already invoiced needs a credit or reissued invoice, not a merge.
 */

import type { Prisma } from "@prisma/client";

import { CanonicalSubscriptionValidationError, commercialDateString } from "./canonical-subscription-application";

/**
 * Excludes ended/canceled subscriptions that no longer hold any service (e.g. emptied by a
 * merge) from admin lists. The records stay in the database for audit and stay reachable by URL.
 * The explicit null branch keeps legacy rows, which have no lifecycle status.
 */
export const HIDE_EMPTY_RETIRED_SUBSCRIPTIONS = {
  OR: [
    { lifecycleStatus: null },
    { lifecycleStatus: { notIn: ["ended", "canceled"] } },
    { items: { some: {} } },
  ],
} satisfies Prisma.CustomerSubscriptionWhereInput;

/** Lifecycles that can take part. Paused and ended subscriptions are never merged. */
export const MERGEABLE_LIFECYCLES = ["draft", "pending_activation", "active"] as const;

export type MergeSubscriptionSnapshot = {
  id: string;
  name: string | null;
  customerId: string;
  controlMode: string;
  lifecycleStatus: string | null;
  collectionMethod: string | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  nextBillingDate: Date | null;
  gracePeriodDays: number;
  hasMigrationLedger: boolean;
  hasPilotActivation: boolean;
  invoiceCount: number;
  billingInvoiceCount: number;
  billingOperationCount: number;
  providerLinkCount: number;
  /** Invoice created by the operational activation, if any. */
  initialInvoiceId: string | null;
  items: {
    id: string;
    status: string;
    /** Invoices that snapshotted this service's rate. */
    invoiceSnapshotCount: number;
    /** Invoice created for the agreed partial-period charge, if any. */
    adjustmentInvoiceId: string | null;
  }[];
  /** Recurring invoice schedules that are not ended. */
  schedules: {
    id: string;
    hasGeneratedInvoice: boolean;
    dueDaysAfterIssue: number;
    autoEmail: boolean;
    emailTo: string | null;
  }[];
};

export type SubscriptionMergePlan = {
  targetId: string;
  sourceIds: string[];
  /** Every service of every source (ended ones too, so the sources are left empty). */
  movedItemIds: string[];
  /** How many of those are live services that will appear on the merged invoice. */
  movedLiveServiceCount: number;
  /** Non-ended schedules that stop generating invoices. */
  endedScheduleIds: string[];
};

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

const label = (snapshot: MergeSubscriptionSnapshot) => snapshot.name?.trim() || "A subscription";
const dayOf = (value: Date | null) => (value ? commercialDateString(value) : "none");

/** Reasons this subscription cannot take part in a merge at all. Empty means it can. */
export function mergeBlockers(snapshot: MergeSubscriptionSnapshot): string[] {
  const blockers: string[] = [];
  if (snapshot.controlMode !== "canonical") blockers.push("Only canonical subscriptions can be merged.");
  if (snapshot.hasMigrationLedger || snapshot.hasPilotActivation) blockers.push("It is a migration record, which keeps its own source authority.");
  if (!snapshot.lifecycleStatus || !(MERGEABLE_LIFECYCLES as readonly string[]).includes(snapshot.lifecycleStatus)) {
    blockers.push("Only draft, pending or active subscriptions can be merged.");
  }
  if (snapshot.collectionMethod !== "manual_invoice") {
    blockers.push("Only manual-invoice subscriptions can be merged. Card billing keeps its own provider schedule.");
  }
  if (!snapshot.billingIntervalMonths || !snapshot.nextBillingDate) blockers.push("It is missing its billing cadence or renewal date.");
  if (snapshot.providerLinkCount > 0) blockers.push("A payment provider is linked.");
  if (snapshot.billingOperationCount > 0) blockers.push("Billing operations have already run for it.");
  if (
    snapshot.invoiceCount > 0
    || snapshot.billingInvoiceCount > 0
    || snapshot.initialInvoiceId
    || snapshot.items.some((item) => item.invoiceSnapshotCount > 0 || item.adjustmentInvoiceId)
  ) {
    blockers.push("It has already been invoiced. Adjust invoices with a credit or reissue instead of merging.");
  }
  if (snapshot.schedules.some((schedule) => schedule.hasGeneratedInvoice)) blockers.push("Its recurring schedule has already generated an invoice.");
  if (snapshot.schedules.length > 1) blockers.push("It has more than one open recurring schedule; resolve that first.");
  return blockers;
}

/** Subscriptions can only be merged when this is identical: it is the term the customer agreed to. */
export function mergeCompatibilityKey(snapshot: Pick<MergeSubscriptionSnapshot, "billingIntervalMonths" | "currency" | "nextBillingDate" | "collectionMethod" | "lifecycleStatus" | "gracePeriodDays">): string {
  return [
    snapshot.billingIntervalMonths ?? "none",
    (snapshot.currency ?? "none").toUpperCase(),
    dayOf(snapshot.nextBillingDate),
    snapshot.collectionMethod ?? "none",
    snapshot.lifecycleStatus ?? "none",
    snapshot.gracePeriodDays,
  ].join("|");
}

/**
 * Validates that `sources` can be folded into `target` and works out exactly what moves.
 * Throws a {@link CanonicalSubscriptionValidationError} with a staff-readable message.
 */
export function planSubscriptionMerge(target: MergeSubscriptionSnapshot, sources: MergeSubscriptionSnapshot[]): SubscriptionMergePlan {
  if (!sources.length) fail("MERGE_NO_SOURCES", "Choose at least one subscription to merge into the target.");
  const all = [target, ...sources];
  if (new Set(all.map((snapshot) => snapshot.id)).size !== all.length) {
    fail("MERGE_DUPLICATE", "A subscription cannot be merged into itself or chosen twice.");
  }
  if (all.some((snapshot) => snapshot.customerId !== target.customerId)) {
    fail("MERGE_CROSS_CUSTOMER", "Subscriptions can only be merged within one customer.");
  }
  for (const snapshot of all) {
    const blockers = mergeBlockers(snapshot);
    if (blockers.length) fail("MERGE_BLOCKED", `${label(snapshot)} cannot be merged: ${blockers[0]}`);
  }

  const targetKey = mergeCompatibilityKey(target);
  for (const source of sources) {
    if (mergeCompatibilityKey(source) !== targetKey) {
      const differences: string[] = [];
      if (source.billingIntervalMonths !== target.billingIntervalMonths) differences.push("billing cycle");
      if ((source.currency ?? "").toUpperCase() !== (target.currency ?? "").toUpperCase()) differences.push("currency");
      if (dayOf(source.nextBillingDate) !== dayOf(target.nextBillingDate)) differences.push("renewal date");
      if (source.lifecycleStatus !== target.lifecycleStatus) differences.push("status");
      if (source.gracePeriodDays !== target.gracePeriodDays) differences.push("grace period");
      fail("MERGE_INCOMPATIBLE", `${label(source)} differs from the target in ${differences.join(", ") || "its terms"}. Only subscriptions with identical terms can be merged.`);
    }
  }

  // Collection terms live on the schedule; merging must not silently change them for any service.
  const openSchedules = all.flatMap((snapshot) => snapshot.schedules);
  const first = openSchedules[0];
  if (first && openSchedules.some((schedule) => schedule.dueDaysAfterIssue !== first.dueDaysAfterIssue || schedule.autoEmail !== first.autoEmail || (schedule.emailTo ?? "") !== (first.emailTo ?? ""))) {
    fail("MERGE_SCHEDULE_TERMS_DIFFER", "The recurring invoice schedules have different payment terms or email settings. Align them before merging.");
  }
  if (target.lifecycleStatus === "active" && target.schedules.length !== 1) {
    fail("MERGE_TARGET_NO_SCHEDULE", `${label(target)} is active but has no open recurring schedule to invoice the merged services. Choose a different target.`);
  }

  const movedItems = sources.flatMap((source) => source.items);
  return {
    targetId: target.id,
    sourceIds: sources.map((source) => source.id),
    movedItemIds: movedItems.map((item) => item.id),
    movedLiveServiceCount: movedItems.filter((item) => !["ended", "canceled"].includes(item.status)).length,
    endedScheduleIds: sources.flatMap((source) => source.schedules.map((schedule) => schedule.id)),
  };
}

/** Cheap grouping used to suggest a merge; the real checks are {@link planSubscriptionMerge}. */
export function suggestedMergeGroups<T extends Pick<MergeSubscriptionSnapshot, "id" | "billingIntervalMonths" | "currency" | "nextBillingDate" | "collectionMethod" | "lifecycleStatus" | "gracePeriodDays" | "controlMode">>(subscriptions: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const subscription of subscriptions) {
    if (subscription.controlMode !== "canonical" || subscription.collectionMethod !== "manual_invoice") continue;
    if (!subscription.lifecycleStatus || !(MERGEABLE_LIFECYCLES as readonly string[]).includes(subscription.lifecycleStatus)) continue;
    const key = mergeCompatibilityKey(subscription);
    groups.set(key, [...(groups.get(key) ?? []), subscription]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
