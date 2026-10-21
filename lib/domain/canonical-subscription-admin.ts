import { Prisma } from "@prisma/client";

import { normalizedMonthlyRecurringRevenue } from "./canonical-subscription-application";

export const CANONICAL_SUBSCRIPTION_UI_FLAG = "CANONICAL_SUBSCRIPTION_UI_ENABLED";
export const CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBILITY_FLAG = "CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE";

export type CanonicalSubscriptionUiEnvironment = {
  CANONICAL_SUBSCRIPTION_UI_ENABLED?: string;
  CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export type CanonicalSubscriptionUiAccess =
  | "editable_draft"
  | "canonical_operational"
  | "legacy_read_only"
  | "migrated_shadow_read_only"
  | "shadow_read_only"
  | "canonical_read_only";

export type CanonicalSubscriptionProviderStatus =
  | "not_applicable"
  | "not_connected"
  | "linked_observation_unavailable"
  | "attention";

export type CanonicalSubscriptionAdminRow = {
  id: string;
  customerId: string;
  customer: string;
  name: string;
  reference: string | null;
  collectionMethod: string | null;
  lifecycleStatus: string;
  controlMode: "legacy" | "shadow" | "canonical";
  access: CanonicalSubscriptionUiAccess;
  billingIntervalMonths: number | null;
  currency: string;
  itemCount: number;
  recurringCycleTotal: string | null;
  normalizedMrr: string | null;
  nextBillingDate: Date | null;
  collectionHealth: string | null;
  attentionRequired: boolean;
  providerStatus: CanonicalSubscriptionProviderStatus;
  /** A terminated arrangement is retained for audit/history, but is not current work. */
  historical: boolean;
};

export type CanonicalSubscriptionAdminRowInput = Omit<
  CanonicalSubscriptionAdminRow,
  "access" | "normalizedMrr" | "providerStatus" | "historical"
> & {
  hasMigrationLedger: boolean;
  legacyMonthlyRate?: string | null;
  legacyQuantity?: number | null;
  providerStatus?: CanonicalSubscriptionProviderStatus;
};

export type CanonicalSubscriptionAdminFilters = {
  query?: string;
  view?: string;
  collectionMethod?: string;
  lifecycleStatus?: string;
  controlMode?: string;
  providerStatus?: string;
};

/** Presentation-only state: lifecycle, readiness, collection, and authority stay separate. */
export type CanonicalSubscriptionWorkspacePresentation = {
  lifecycleLabel: string;
  issueLabel: string | null;
  issueDetail: string | null;
  actionLabel: "Continue setup" | "Manage" | "Review details" | "View history";
};
export class CanonicalSubscriptionUiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalSubscriptionUiError";
    this.code = code;
  }
}

export function canonicalSubscriptionUiEnabled(
  environment: CanonicalSubscriptionUiEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.CANONICAL_SUBSCRIPTION_UI_ENABLED === "true";
}

/**
 * Read-only route visibility is deliberately separate from the local draft
 * editing flag. Production can expose the review screens only when the owner
 * explicitly opts in; this function never enables billing or write actions.
 */
export function canonicalSubscriptionUiVisible(
  environment: CanonicalSubscriptionUiEnvironment = process.env,
): boolean {
  if (canonicalSubscriptionUiEnabled(environment)) return true;
  return environment.NODE_ENV === "production"
    && (environment.VERCEL_ENV == null || environment.VERCEL_ENV === "production")
    && environment.CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE === "true";
}

export function assertCanonicalSubscriptionUiEnabled(
  environment: CanonicalSubscriptionUiEnvironment = process.env,
): void {
  if (environment.NODE_ENV === "production") {
    throw new CanonicalSubscriptionUiError(
      "PRODUCTION_UI_DISABLED",
      "Canonical subscription administration is disabled in production during Phase UI-1.",
    );
  }
  if (environment.CANONICAL_SUBSCRIPTION_UI_ENABLED !== "true") {
    throw new CanonicalSubscriptionUiError(
      "FEATURE_DISABLED",
      `${CANONICAL_SUBSCRIPTION_UI_FLAG}=true is required for local canonical subscription administration.`,
    );
  }
}

export function canonicalSubscriptionUiAccess(input: {
  controlMode: "legacy" | "shadow" | "canonical";
  lifecycleStatus: string | null;
  hasMigrationLedger: boolean;
}): CanonicalSubscriptionUiAccess {
  if (input.controlMode === "legacy") return "legacy_read_only";
  if (input.controlMode === "canonical" && input.lifecycleStatus === "draft") return "editable_draft";
  if (input.controlMode === "canonical" && ["pending_activation", "active", "paused"].includes(input.lifecycleStatus ?? "")) {
    return "canonical_operational";
  }
  // A completed migration ledger is audit history, not a permanent lock once
  // the agreement has safely adopted canonical billing authority.
  if (input.hasMigrationLedger) return "migrated_shadow_read_only";
  if (input.controlMode === "canonical") return "canonical_read_only";
  if (input.lifecycleStatus === "draft") return "editable_draft";
  return "shadow_read_only";
}

export function assertCanonicalSubscriptionUiActionAllowed(input: {
  authenticated: boolean;
  access: CanonicalSubscriptionUiAccess;
  environment?: CanonicalSubscriptionUiEnvironment;
}): void {
  assertCanonicalSubscriptionUiEnabled(input.environment);
  if (!input.authenticated) {
    throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "You must be signed in.");
  }
  if (input.access !== "editable_draft") {
    throw new CanonicalSubscriptionUiError(
      "SUBSCRIPTION_READ_ONLY",
      "Only an unmigrated canonical shadow subscription in draft status can be edited in Phase UI-1.",
    );
  }
}

/**
 * Staff may manage a normal canonical agreement after activation, but never a
 * legacy arrangement or a migration shadow. Financial execution retains its
 * separate native/Stripe production guards.
 */
export function assertCanonicalSubscriptionManagementAllowed(input: {
  authenticated: boolean;
  access: CanonicalSubscriptionUiAccess;
  controlMode: "legacy" | "shadow" | "canonical";
  environment?: CanonicalSubscriptionUiEnvironment;
}): void {
  if (!input.authenticated) {
    throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "You must be signed in.");
  }
  if (!["editable_draft", "canonical_operational"].includes(input.access) || input.controlMode !== "canonical") {
    throw new CanonicalSubscriptionUiError(
      "SUBSCRIPTION_READ_ONLY",
      "Only a normal canonical draft, pending, active, or paused agreement can be managed here.",
    );
  }
  const environment = input.environment ?? process.env;
  if (environment.NODE_ENV === "production") {
    if (!canonicalSubscriptionUiVisible(environment)) {
      throw new CanonicalSubscriptionUiError(
        "PRODUCTION_UI_DISABLED",
        "Canonical subscription administration requires the approved production administration setting.",
      );
    }
    return;
  }
  assertCanonicalSubscriptionUiEnabled(environment);
}

/** New-customer onboarding may edit only fresh canonical drafts in production. */
export function assertCanonicalSubscriptionOnboardingAllowed(input: {
  authenticated: boolean;
  access: CanonicalSubscriptionUiAccess;
  controlMode?: "legacy" | "shadow" | "canonical";
  environment?: CanonicalSubscriptionUiEnvironment;
}): void {
  const environment = input.environment ?? process.env;
  if (!input.authenticated) {
    throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "You must be signed in.");
  }
  if (input.access !== "editable_draft") {
    throw new CanonicalSubscriptionUiError(
      "SUBSCRIPTION_READ_ONLY",
      "Only an unmigrated canonical draft can be edited.",
    );
  }
  if (environment.NODE_ENV === "production") {
    if (!canonicalSubscriptionUiVisible(environment)) {
      throw new CanonicalSubscriptionUiError(
        "PRODUCTION_UI_DISABLED",
        "Canonical customer onboarding requires the approved production administration setting.",
      );
    }
    if (input.controlMode !== "canonical") {
      throw new CanonicalSubscriptionUiError(
        "SHADOW_WRITE_DISABLED",
        "Production onboarding cannot modify a legacy migration shadow.",
      );
    }
    return;
  }
  assertCanonicalSubscriptionUiEnabled(environment);
}

export function normalizedMonthlyAmount(
  cycleTotal: string | null,
  billingIntervalMonths: number | null,
): string | null {
  if (cycleTotal == null || billingIntervalMonths == null) return null;
  return normalizedMonthlyRecurringRevenue(
    new Prisma.Decimal(cycleTotal),
    billingIntervalMonths,
  ).toFixed(2);
}

export function buildCanonicalSubscriptionAdminRow(
  input: CanonicalSubscriptionAdminRowInput,
): CanonicalSubscriptionAdminRow {
  const access = canonicalSubscriptionUiAccess(input);
  const normalizedMrr = input.controlMode === "legacy"
    ? input.legacyMonthlyRate == null
      ? null
      : new Prisma.Decimal(input.legacyMonthlyRate).mul(input.legacyQuantity ?? 1).toFixed(2)
    : normalizedMonthlyAmount(input.recurringCycleTotal, input.billingIntervalMonths);
  return {
    id: input.id,
    customerId: input.customerId,
    customer: input.customer,
    name: input.name,
    reference: input.reference,
    collectionMethod: input.collectionMethod,
    lifecycleStatus: input.lifecycleStatus,
    controlMode: input.controlMode,
    access,
    billingIntervalMonths: input.billingIntervalMonths,
    currency: input.currency,
    itemCount: input.itemCount,
    recurringCycleTotal: input.recurringCycleTotal,
    normalizedMrr,
    nextBillingDate: input.nextBillingDate,
    collectionHealth: input.collectionHealth,
    attentionRequired: input.attentionRequired,
    providerStatus: input.providerStatus ?? "not_applicable",
    historical: input.controlMode === "legacy"
      ? input.lifecycleStatus === "canceled"
      : input.lifecycleStatus === "canceled" || input.lifecycleStatus === "ended",
  };
}

export function deriveCanonicalProviderStatus(input: {
  controlMode: "legacy" | "shadow" | "canonical";
  collectionMethod: string | null;
  providerLinks: { provider: string; endedAt: Date | null; lastError?: string | null }[];
  operationStatuses?: { status: string; failureMessage?: string | null }[];
}): CanonicalSubscriptionProviderStatus {
  if (input.controlMode === "legacy" || input.collectionMethod !== "stripe_autocharge") {
    return "not_applicable";
  }
  const hasAttention = input.providerLinks.some((link) => Boolean(link.lastError))
    || input.operationStatuses?.some((operation) => ["failed", "retry_required"].includes(operation.status))
    || false;
  if (hasAttention) return "attention";
  const hasOpenStripeLink = input.providerLinks.some(
    (link) => link.provider === "stripe" && link.endedAt == null,
  );
  return hasOpenStripeLink ? "linked_observation_unavailable" : "not_connected";
}

export function canonicalProviderStatusLabel(status: CanonicalSubscriptionProviderStatus): string {
  switch (status) {
    case "not_applicable": return "Not applicable";
    case "not_connected": return "Not connected";
    case "linked_observation_unavailable": return "Linked · observation unavailable";
    case "attention": return "Needs provider review";
  }
}

export function filterCanonicalSubscriptionAdminRows(
  rows: CanonicalSubscriptionAdminRow[],
  filters: CanonicalSubscriptionAdminFilters,
): CanonicalSubscriptionAdminRow[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (query && !`${row.customer} ${row.name} ${row.reference ?? ""}`.toLowerCase().includes(query)) return false;
    if (filters.view === "drafts" && row.access !== "editable_draft") return false;
    if (filters.view === "migrated" && row.access !== "migrated_shadow_read_only") return false;
    if (filters.view === "canonical" && row.controlMode !== "canonical") return false;
    if (filters.view === "legacy" && row.controlMode !== "legacy") return false;
    if (filters.view === "current" && row.historical) return false;
    if (filters.view === "history" && !row.historical) return false;
    if (filters.collectionMethod && row.collectionMethod !== filters.collectionMethod) return false;
    if (filters.lifecycleStatus && row.lifecycleStatus !== filters.lifecycleStatus) return false;
    if (filters.controlMode && row.controlMode !== filters.controlMode) return false;
    if (filters.providerStatus && row.providerStatus !== filters.providerStatus) return false;
    return true;
  });
}

export function canonicalSubscriptionWorkspacePresentation(
  row: CanonicalSubscriptionAdminRow,
): CanonicalSubscriptionWorkspacePresentation {
  const lifecycleLabel = row.lifecycleStatus.replaceAll("_", " ");
  if (row.historical) return { lifecycleLabel, issueLabel: null, issueDetail: null, actionLabel: "View history" };
  if (row.controlMode === "shadow" || ["migrated_shadow_read_only", "shadow_read_only"].includes(row.access)) {
    return {
      lifecycleLabel: row.lifecycleStatus === "unclassified" ? "Review" : lifecycleLabel,
      issueLabel: "Source-controlled",
      issueDetail: "Source billing authority is preserved while this record is reviewed.",
      actionLabel: "Review details",
    };
  }
  if (row.controlMode === "canonical" && row.access === "editable_draft") {
    return {
      lifecycleLabel: "Draft",
      issueLabel: "Setup required",
      issueDetail: "This inactive agreement needs its commercial and activation review completed.",
      actionLabel: "Continue setup",
    };
  }
  if (row.attentionRequired) {
    return {
      lifecycleLabel,
      issueLabel: "Collection alert",
      issueDetail: "An invoice is beyond its configured grace period or a provider operation needs review.",
      actionLabel: "Manage",
    };
  }
  if (row.lifecycleStatus === "paused") return { lifecycleLabel: "Paused", issueLabel: null, issueDetail: null, actionLabel: "Manage" };
  return { lifecycleLabel, issueLabel: null, issueDetail: null, actionLabel: "Manage" };
}

export function isOperationalCanonicalSubscription(row: CanonicalSubscriptionAdminRow): boolean {
  return row.controlMode === "canonical" && row.lifecycleStatus === "active";
}

export function canonicalIntervalLabel(months: number | null): string {
  if (months === 1) return "Monthly";
  if (months === 3) return "Quarterly";
  if (months === 4) return "Every 4 months";
  if (months === 6) return "Every 6 months";
  if (months === 12) return "Annual";
  return "Not configured";
}

export function canonicalSubscriptionDisplayName(
  name: string | null | undefined,
  billingIntervalMonths: number | null,
): string {
  const trimmed = name?.trim() ?? "";
  const isInternalMigrationName = /^(canonical\s+)?migration\b/i.test(trimmed)
    || /\bshadow\b/i.test(trimmed);
  if (trimmed && !isInternalMigrationName) return trimmed;
  const interval = canonicalIntervalLabel(billingIntervalMonths);
  return interval === "Not configured" ? "GPS tracking subscription" : `${interval} GPS tracking`;
}

export function canonicalControlLabel(access: CanonicalSubscriptionUiAccess): string {
  switch (access) {
    case "editable_draft": return "Shadow draft";
    case "canonical_operational": return "Canonical";
    case "legacy_read_only": return "Legacy";
    case "migrated_shadow_read_only": return "Migrated shadow";
    case "shadow_read_only": return "Shadow";
    case "canonical_read_only": return "Canonical";
  }
}
