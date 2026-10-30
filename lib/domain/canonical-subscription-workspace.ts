/**
 * Presentation-only grouping for the main Subscriptions listing.
 *
 * Every canonical subscription record stays an independent record (own id,
 * cadence, renewal date, collection method). This module only decides how the
 * existing admin rows are filtered, grouped under their canonical customer id
 * (never the display name), sorted, paginated, and summarised. It performs no
 * reads or writes and introduces no new billing calculation: recurring amounts
 * and MRR come straight from the rows produced by the existing admin service.
 */
import { Prisma } from "@prisma/client";

import {
  canonicalSubscriptionDisplayName,
  canonicalSubscriptionWorkspacePresentation,
  isOperationalCanonicalSubscription,
  type CanonicalSubscriptionAdminRow,
} from "./canonical-subscription-admin";

export const WORKSPACE_STATUS_FILTERS = ["all", "active", "attention", "paused", "history"] as const;
export type WorkspaceStatusFilter = (typeof WORKSPACE_STATUS_FILTERS)[number];

export const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatusFilter, string> = {
  all: "All statuses",
  active: "Active",
  attention: "Needs attention",
  paused: "Paused",
  history: "Ended / history",
};

export const WORKSPACE_SORT_KEYS = ["customer", "services", "recurring", "renewal", "status"] as const;
export type WorkspaceSortKey = (typeof WORKSPACE_SORT_KEYS)[number];
export type WorkspaceSortDirection = "asc" | "desc";

export const WORKSPACE_DEFAULT_PAGE_SIZE = 20;

export type WorkspaceQuery = {
  query?: string;
  status?: WorkspaceStatusFilter;
  /** Billing interval in months, or "none" for subscriptions without a configured cadence. */
  cadence?: number | "none" | null;
  sort?: WorkspaceSortKey;
  direction?: WorkspaceSortDirection;
  page?: number;
  pageSize?: number;
};

/** Normalises raw URL search params. Unknown values fall back to safe defaults. */
export function parseWorkspaceSearchParams(raw: {
  q?: string;
  status?: string;
  view?: string;
  cadence?: string;
  sort?: string;
  dir?: string;
  page?: string;
}): Required<Pick<WorkspaceQuery, "query" | "status" | "cadence" | "sort" | "direction" | "page">> {
  // Earlier bookmarks used `view=`; keep them landing somewhere sensible.
  const legacyView: Record<string, WorkspaceStatusFilter> = {
    current: "all", active: "active", setup: "attention", review: "attention",
    alerts: "attention", paused: "paused", history: "history",
  };
  const status = (WORKSPACE_STATUS_FILTERS as readonly string[]).includes(raw.status ?? "")
    ? raw.status as WorkspaceStatusFilter
    : legacyView[raw.view ?? ""] ?? "all";
  const cadenceNumber = Number(raw.cadence);
  const cadence = raw.cadence === "none"
    ? "none" as const
    : Number.isInteger(cadenceNumber) && cadenceNumber > 0 ? cadenceNumber : null;
  const sort = (WORKSPACE_SORT_KEYS as readonly string[]).includes(raw.sort ?? "")
    ? raw.sort as WorkspaceSortKey
    : "customer";
  const direction: WorkspaceSortDirection = raw.dir === "desc" ? "desc" : "asc";
  return {
    query: raw.q?.trim() ?? "",
    status,
    cadence,
    sort,
    direction,
    page: Math.max(1, Math.trunc(Number(raw.page)) || 1),
  };
}

/* ------------------------------------------------------------------ */
/* Row-level classification (shared by summary, filters, and display) */
/* ------------------------------------------------------------------ */

export function isSetupRequired(row: CanonicalSubscriptionAdminRow): boolean {
  return !row.historical && row.controlMode === "canonical" && row.access === "editable_draft";
}

export function isBillingReviewRequired(row: CanonicalSubscriptionAdminRow): boolean {
  return !row.historical
    && (row.controlMode === "shadow" || ["migrated_shadow_read_only", "shadow_read_only"].includes(row.access));
}

/**
 * Actionable problems only: unfinished setup, billing review, or a collection /
 * provider alert. Active, paused, pending, and ended are ordinary statuses.
 * These are the same three conditions the former "Next actions" panel counted,
 * evaluated once per subscription so nothing is double counted.
 */
export function subscriptionNeedsAttention(row: CanonicalSubscriptionAdminRow): boolean {
  return !row.historical && (isSetupRequired(row) || isBillingReviewRequired(row) || row.attentionRequired);
}

export type WorkspaceStatusTone = "active" | "attention" | "alert" | "paused" | "neutral" | "ended";

export type WorkspaceStatusView = {
  label: string;
  tone: WorkspaceStatusTone;
  detail: string | null;
  /** Lower sorts first: attention, active, paused, other, ended. */
  rank: number;
};

function titleCase(value: string): string {
  const text = value.replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

export function subscriptionStatusView(row: CanonicalSubscriptionAdminRow): WorkspaceStatusView {
  const presentation = canonicalSubscriptionWorkspacePresentation(row);
  if (row.historical) {
    return { label: "Ended", tone: "ended", detail: titleCase(row.lifecycleStatus), rank: 4 };
  }
  if (isSetupRequired(row)) {
    return { label: "Setup required", tone: "attention", detail: presentation.issueDetail, rank: 0 };
  }
  if (isBillingReviewRequired(row)) {
    return {
      label: "Needs review",
      tone: "attention",
      detail: "Billing authority for this record is still being reviewed.",
      rank: 0,
    };
  }
  if (row.attentionRequired) {
    return { label: "Collection alert", tone: "alert", detail: presentation.issueDetail, rank: 0 };
  }
  if (row.lifecycleStatus === "paused") return { label: "Paused", tone: "paused", detail: null, rank: 2 };
  if (row.lifecycleStatus === "active") return { label: "Active", tone: "active", detail: null, rank: 1 };
  return { label: titleCase(row.lifecycleStatus), tone: "neutral", detail: null, rank: 3 };
}

export function cadenceLabel(months: number | null): string {
  if (months == null) return "Not configured";
  if (months === 1) return "Monthly";
  if (months === 3) return "Quarterly";
  if (months === 12) return "Annual";
  return `Every ${months} months`;
}

export function cadencePeriodSuffix(months: number | null): string {
  if (months == null) return "";
  if (months === 1) return "/ month";
  if (months === 3) return "/ quarter";
  if (months === 12) return "/ year";
  return `/ ${months} months`;
}

const COLLECTION_LABELS: Record<string, string> = {
  stripe_autocharge: "Card billing",
  manual_invoice: "Manual invoice",
};

export function collectionMethodLabel(value: string | null): string {
  return (value && COLLECTION_LABELS[value]) || "Not configured";
}

/** `@db.Date` values are UTC midnights; format in UTC so the calendar day never shifts. */
export function formatWorkspaceDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ */
/* Filtering, grouping, sorting, pagination                            */
/* ------------------------------------------------------------------ */

function matchesStatus(row: CanonicalSubscriptionAdminRow, status: WorkspaceStatusFilter): boolean {
  switch (status) {
    case "all": return true;
    // Same predicate as the Active Subscriptions summary figure.
    case "active": return isOperationalCanonicalSubscription(row);
    case "attention": return subscriptionNeedsAttention(row);
    case "paused": return !row.historical && row.lifecycleStatus === "paused";
    case "history": return row.historical;
  }
}

function matchesCadence(row: CanonicalSubscriptionAdminRow, cadence: WorkspaceQuery["cadence"]): boolean {
  if (cadence == null) return true;
  if (cadence === "none") return row.billingIntervalMonths == null;
  return row.billingIntervalMonths === cadence;
}

function matchesText(row: CanonicalSubscriptionAdminRow, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    row.customer,
    row.name,
    canonicalSubscriptionDisplayName(row.name, row.billingIntervalMonths),
    row.reference ?? "",
    row.id,
  ].join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export type WorkspaceGroup = {
  customerId: string;
  customer: string;
  /** Canonical subscriptions this customer has in total, before any filter. */
  totalSubscriptionCount: number;
  /** Subscriptions that match the current search and filters. */
  rows: CanonicalSubscriptionAdminRow[];
};

export type WorkspaceMetrics = {
  /** Canonical subscription records (not customers, not services). */
  totalCount: number;
  activeCount: number;
  needsAttentionCount: number;
  /** Null when active subscriptions span several currencies. */
  operationalMrr: number | null;
  operationalMrrCurrency: string | null;
  currencyCount: number;
};

export function computeWorkspaceMetrics(rows: CanonicalSubscriptionAdminRow[]): WorkspaceMetrics {
  const canonical = rows.filter((row) => row.controlMode !== "legacy");
  const operational = canonical.filter((row) => !row.historical && isOperationalCanonicalSubscription(row));
  const currencies = [...new Set(operational.map((row) => row.currency).filter(Boolean))].sort();
  const mrr = operational.reduce((sum, row) => sum.plus(new Prisma.Decimal(row.normalizedMrr ?? 0)), new Prisma.Decimal(0));
  return {
    totalCount: canonical.length,
    activeCount: operational.length,
    needsAttentionCount: canonical.filter(subscriptionNeedsAttention).length,
    operationalMrr: currencies.length === 1 ? Number(mrr.toFixed(2)) : null,
    operationalMrrCurrency: currencies.length === 1 ? currencies[0] : null,
    currencyCount: currencies.length,
  };
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

/** Within a customer: current subscriptions first, then by next cycle, cadence, and name. */
function compareWithinGroup(left: CanonicalSubscriptionAdminRow, right: CanonicalSubscriptionAdminRow): number {
  if (left.historical !== right.historical) return left.historical ? 1 : -1;
  const leftDate = left.nextBillingDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightDate = right.nextBillingDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftDate - rightDate
    || (right.billingIntervalMonths ?? 0) - (left.billingIntervalMonths ?? 0)
    || compareText(left.name, right.name)
    || left.id.localeCompare(right.id);
}

function currentRows(group: WorkspaceGroup): CanonicalSubscriptionAdminRow[] {
  const current = group.rows.filter((row) => !row.historical);
  return current.length ? current : group.rows;
}

function groupSortValue(group: WorkspaceGroup, key: WorkspaceSortKey): number | null {
  const rows = currentRows(group);
  switch (key) {
    case "customer": return null;
    case "services": return rows.reduce((sum, row) => sum + row.itemCount, 0);
    // Ordering only (never displayed): MRR is already normalised to a month.
    case "recurring": return rows.reduce((sum, row) => sum + Number(row.normalizedMrr ?? 0), 0);
    case "renewal": {
      const dates = rows.map((row) => row.nextBillingDate?.getTime()).filter((value): value is number => value != null);
      return dates.length ? Math.min(...dates) : null;
    }
    case "status": return Math.min(...group.rows.map((row) => subscriptionStatusView(row).rank));
  }
}

export function sortWorkspaceGroups(
  groups: WorkspaceGroup[],
  key: WorkspaceSortKey,
  direction: WorkspaceSortDirection,
): WorkspaceGroup[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...groups].sort((left, right) => {
    if (key !== "customer") {
      const a = groupSortValue(left, key);
      const b = groupSortValue(right, key);
      // Unscheduled / empty values always sit last regardless of direction.
      if (a == null && b != null) return 1;
      if (a != null && b == null) return -1;
      if (a != null && b != null && a !== b) return (a - b) * sign;
    }
    const byName = compareText(left.customer, right.customer);
    if (key === "customer" && byName !== 0) return byName * sign;
    return byName || left.customerId.localeCompare(right.customerId);
  });
}

export type WorkspaceResult = {
  metrics: WorkspaceMetrics;
  /** Customer groups on the requested page. Groups are never split across pages. */
  groups: WorkspaceGroup[];
  groupTotal: number;
  subscriptionTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Billing cadences that exist in the data, for the filter control. */
  cadenceOptions: { value: string; label: string }[];
  /** True when the unfiltered data set has no canonical subscriptions at all. */
  isEmpty: boolean;
};

export function buildSubscriptionWorkspace(
  allRows: CanonicalSubscriptionAdminRow[],
  query: WorkspaceQuery = {},
): WorkspaceResult {
  // Legacy rows are not canonical subscriptions; they stay on their existing pages.
  const rows = allRows.filter((row) => row.controlMode !== "legacy");
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.customerId, (totals.get(row.customerId) ?? 0) + 1);

  const tokens = (query.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const status = query.status ?? "all";
  const matching = rows.filter((row) =>
    matchesText(row, tokens) && matchesStatus(row, status) && matchesCadence(row, query.cadence));

  // Group by canonical customer id. The display name is never used as a key.
  const byCustomer = new Map<string, WorkspaceGroup>();
  for (const row of matching) {
    const existing = byCustomer.get(row.customerId);
    if (existing) existing.rows.push(row);
    else byCustomer.set(row.customerId, {
      customerId: row.customerId,
      customer: row.customer,
      totalSubscriptionCount: totals.get(row.customerId) ?? 1,
      rows: [row],
    });
  }
  const groups = [...byCustomer.values()];
  for (const group of groups) group.rows.sort(compareWithinGroup);

  const sorted = sortWorkspaceGroups(groups, query.sort ?? "customer", query.direction ?? "asc");
  const pageSize = Math.min(Math.max(query.pageSize ?? WORKSPACE_DEFAULT_PAGE_SIZE, 1), 100);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);

  const cadences = new Set<number | null>([1, 3, 12]);
  for (const row of rows) cadences.add(row.billingIntervalMonths);
  const cadenceOptions = [...cadences]
    .sort((a, b) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER))
    .map((months) => ({ value: months == null ? "none" : String(months), label: cadenceLabel(months) }));

  return {
    metrics: computeWorkspaceMetrics(rows),
    groups: sorted.slice((page - 1) * pageSize, page * pageSize),
    groupTotal: sorted.length,
    subscriptionTotal: matching.length,
    page,
    pageSize,
    pageCount,
    cadenceOptions,
    isEmpty: rows.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Serializable view models                                            */
/* ------------------------------------------------------------------ */

export type SubscriptionRowView = {
  id: string;
  /** Existing Subscription Details URL; unchanged by this redesign. */
  href: string;
  name: string;
  cadence: string;
  reference: string | null;
  collection: string;
  services: number;
  servicesLabel: string;
  recurring: string | null;
  recurringPeriod: string | null;
  nextCycle: string;
  status: WorkspaceStatusView;
};

export type CustomerGroupView = {
  /** Canonical customer id. */
  key: string;
  customer: string;
  initials: string;
  /** "single": one row, navigates directly. "group": expandable parent with children. */
  kind: "single" | "group";
  context: string;
  servicesLabel: string;
  recurring: string | null;
  recurringPeriod: string | null;
  nextCycle: string;
  collection: string;
  reference: string | null;
  status: WorkspaceStatusView;
  subscriptions: SubscriptionRowView[];
};

export type WorkspaceFormatters = {
  money: (amount: number, currency: string) => string;
};

export const SUBSCRIPTION_DETAILS_PATH = "/admin/subscriptions/canonical";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function subscriptionRowView(
  row: CanonicalSubscriptionAdminRow,
  formatters: WorkspaceFormatters,
): SubscriptionRowView {
  const recurringTotal = row.recurringCycleTotal;
  const hasRecurring = recurringTotal != null && Number.isFinite(Number(recurringTotal));
  return {
    id: row.id,
    href: `${SUBSCRIPTION_DETAILS_PATH}/${row.id}`,
    name: canonicalSubscriptionDisplayName(row.name, row.billingIntervalMonths),
    cadence: cadenceLabel(row.billingIntervalMonths),
    reference: row.reference,
    collection: collectionMethodLabel(row.collectionMethod),
    services: row.itemCount,
    servicesLabel: plural(row.itemCount, "service"),
    recurring: hasRecurring ? formatters.money(Number(recurringTotal), row.currency) : null,
    recurringPeriod: hasRecurring ? cadencePeriodSuffix(row.billingIntervalMonths) || null : null,
    nextCycle: formatWorkspaceDate(row.nextBillingDate) ?? "\u2014",
    status: subscriptionStatusView(row),
  };
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  return letters || "?";
}

export const MULTIPLE_SCHEDULES_LABEL = "Multiple schedules";

export function customerGroupView(group: WorkspaceGroup, formatters: WorkspaceFormatters): CustomerGroupView {
  const subscriptions = group.rows.map((row) => subscriptionRowView(row, formatters));
  const base = { key: group.customerId, customer: group.customer, initials: initialsOf(group.customer), subscriptions };

  // A customer with one subscription in total stays a single, directly navigable row.
  if (group.totalSubscriptionCount <= 1 && group.rows.length === 1) {
    const only = subscriptions[0];
    return {
      ...base,
      kind: "single",
      context: `${only.name} \u00b7 ${only.cadence}`,
      servicesLabel: only.servicesLabel,
      recurring: only.recurring,
      recurringPeriod: only.recurringPeriod,
      nextCycle: only.nextCycle,
      collection: only.collection,
      reference: only.reference,
      status: only.status,
    };
  }

  const current = currentRows(group);
  const hasCurrent = group.rows.some((row) => !row.historical);
  const services = current.reduce((sum, row) => sum + row.itemCount, 0);
  const endedCount = hasCurrent ? group.rows.filter((row) => row.historical).length : 0;

  const cadences = [...new Set(current.map((row) => row.billingIntervalMonths))]
    .sort((a, b) => (b ?? 0) - (a ?? 0))
    .map((months) => cadenceLabel(months));
  const subscriptionPart = group.rows.length === group.totalSubscriptionCount
    ? plural(group.rows.length, "subscription")
    : `${group.rows.length} of ${group.totalSubscriptionCount} subscriptions`;
  const context = [
    plural(services, "service"),
    subscriptionPart + (endedCount ? ` (${endedCount} ended)` : ""),
    cadences.join(" + "),
  ].filter(Boolean).join(" \u00b7 ");

  // One date only if every current subscription shares it; otherwise the schedules differ.
  const cycleKeys = new Set(current.map((row) => row.nextBillingDate?.toISOString() ?? "none"));
  const nextCycle = !hasCurrent || cycleKeys.size === 0
    ? "\u2014"
    : cycleKeys.size > 1
      ? MULTIPLE_SCHEDULES_LABEL
      : formatWorkspaceDate(current[0].nextBillingDate) ?? "\u2014";

  // Customer-level status never reads "Active" while a visible subscription needs attention.
  const attention = current.filter(subscriptionNeedsAttention);
  const statusViews = current.map(subscriptionStatusView);
  const labels = [...new Set(statusViews.map((view) => view.label))];
  let status: WorkspaceStatusView;
  if (!hasCurrent) {
    status = { label: "Ended", tone: "ended", detail: null, rank: 4 };
  } else if (attention.length > 0) {
    status = {
      label: "Needs attention",
      tone: statusViews.some((view) => view.tone === "alert") ? "alert" : "attention",
      detail: `${attention.length} of ${plural(current.length, "subscription")} need attention`,
      rank: 0,
    };
  } else if (labels.length === 1) {
    status = statusViews[0];
  } else {
    status = { label: "Mixed", tone: "neutral", detail: labels.join(", "), rank: 3 };
  }

  const collections = [...new Set(current.map((row) => collectionMethodLabel(row.collectionMethod)))];
  return {
    ...base,
    kind: "group",
    context,
    servicesLabel: plural(services, "service"),
    // Never a combined amount: cadences, renewals and collection methods are independent.
    recurring: null,
    recurringPeriod: null,
    nextCycle,
    collection: collections.length === 1 ? collections[0] : collections.length ? "Mixed" : "\u2014",
    reference: null,
    status,
  };
}
