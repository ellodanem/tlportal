import { createHash } from "node:crypto";

import {
  analyzeSubscriptionMigration,
  type CustomerMigrationReview,
  type LegacyBillingSnapshot,
  type MigrationIssue,
  type SubscriptionMigrationAnalysis,
  type SubscriptionMigrationProposal,
} from "./subscription-migration-analysis";

export const MIGRATION_APPROVAL_SCHEMA_VERSION = "phase-2b-approval-v1" as const;
export const MIGRATION_PLAN_SCHEMA_VERSION = "phase-2b-plan-v1" as const;

type CollectionMethod = "manual_invoice" | "stripe_autocharge";
type LifecycleStatus = "draft" | "pending_activation" | "active" | "paused" | "canceled" | "ended";
type RateClassification = "standard" | "negotiated";

export type MigrationIssueResolution = {
  code: string;
  explanation: string;
};

export type ApprovedMigrationItem = {
  itemKey: string;
  label: string;
  assignmentIds: string[];
  serviceActivatedDate: string;
  billingEffectiveFrom: string;
  billingEffectiveUntil?: string | null;
  agreedAmountPerCycle: string;
  classification: RateClassification;
  changeReason: string;
};

export type ApprovedProviderItem = {
  externalSubscriptionItemId: string;
  externalPriceId: string;
  agreedAmountPerCycle: string;
  quantity: number;
  rateGroupFingerprint: string;
};

export type ApprovedProviderRelationship = {
  provider: "stripe";
  externalSubscriptionId: string;
  providerStatus: string | null;
  activatedAt: string;
  providerItems: ApprovedProviderItem[];
};

export type ApprovedArrangementDecision = {
  proposalId: string;
  approvedBy: string;
  approvedAt: string;
  approvalReason: string;
  name: string;
  reference: string;
  collectionMethod: CollectionMethod;
  lifecycleStatus: LifecycleStatus;
  billingIntervalMonths: 1 | 3 | 6 | 12;
  currency: string;
  commercialStartDate: string;
  billingAnchorDate: string;
  nextBillingDate: string;
  gracePeriodDays: number;
  defaultItemAmountPerCycle: string;
  expectedTotalAmountPerCycle: string;
  items: ApprovedMigrationItem[];
  providerRelationship?: ApprovedProviderRelationship | null;
  issueResolutions: MigrationIssueResolution[];
};

export type CanonicalMigrationApproval = {
  schemaVersion: typeof MIGRATION_APPROVAL_SCHEMA_VERSION;
  sourceFingerprint: string;
  decisions: ApprovedArrangementDecision[];
};

export type CanonicalMigrationPlanItem = ApprovedMigrationItem & {
  assignmentIds: string[];
};

export type CanonicalMigrationPlanEntry = {
  migrationKey: string;
  sourceFingerprint: string;
  sourceKind: SubscriptionMigrationProposal["sourceKind"];
  sourceId: string;
  proposalId: string;
  customerId: string;
  sourceReviewStatus: SubscriptionMigrationProposal["reviewStatus"];
  sourceCycleAmount: string | null;
  proposedCycleAmount: string | null;
  approvedBy: string;
  approvedAt: string;
  approvalReason: string;
  resolvedIssues: MigrationIssueResolution[];
  target: {
    name: string;
    reference: string;
    collectionMethod: CollectionMethod;
    lifecycleStatus: LifecycleStatus;
    billingIntervalMonths: 1 | 3 | 6 | 12;
    currency: string;
    commercialStartDate: string;
    billingAnchorDate: string;
    nextBillingDate: string;
    gracePeriodDays: number;
    defaultItemAmountPerCycle: string;
    expectedTotalAmountPerCycle: string;
    items: CanonicalMigrationPlanItem[];
    providerRelationship: ApprovedProviderRelationship | null;
  };
  historicalReferences: {
    assignmentIds: string[];
    invoiceIds: string[];
    billingInvoiceIds: string[];
    paymentIds: string[];
  };
};

export type CanonicalMigrationPlan = {
  schemaVersion: typeof MIGRATION_PLAN_SCHEMA_VERSION;
  sourceSchemaVersion: LegacyBillingSnapshot["schemaVersion"];
  analysisDate: string;
  sourceFingerprint: string;
  planFingerprint: string;
  entries: CanonicalMigrationPlanEntry[];
  awaitingApproval: Array<{
    proposalId: string;
    customerId: string;
    reviewStatus: SubscriptionMigrationProposal["reviewStatus"];
    issueCodes: string[];
  }>;
};

export class CanonicalMigrationPlanningError extends Error {
  readonly code: string;
  readonly proposalId: string | null;

  constructor(code: string, message: string, proposalId?: string) {
    super(message);
    this.name = "CanonicalMigrationPlanningError";
    this.code = code;
    this.proposalId = proposalId ?? null;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export function stableMigrationJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function migrationFingerprint(value: unknown): string {
  return createHash("sha256").update(stableMigrationJson(value)).digest("hex");
}

export function migrationSourceFingerprint(snapshot: LegacyBillingSnapshot): string {
  return migrationFingerprint(snapshot);
}

function exactMoney(value: string, field: string, proposalId: string): string {
  if (!MONEY_PATTERN.test(value)) {
    throw new CanonicalMigrationPlanningError(
      "INVALID_MONEY",
      `${field} must be a non-negative exact amount with at most two decimal places.`,
      proposalId,
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new CanonicalMigrationPlanningError("INVALID_MONEY", `${field} is too large.`, proposalId);
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function moneyCents(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function requiredText(value: string, field: string, proposalId: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new CanonicalMigrationPlanningError("MISSING_APPROVAL_FIELD", `${field} is required.`, proposalId);
  }
  return cleaned;
}

function dateOnly(value: string, field: string, proposalId: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new CanonicalMigrationPlanningError("INVALID_DATE", `${field} must use YYYY-MM-DD.`, proposalId);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CanonicalMigrationPlanningError("INVALID_DATE", `${field} is not a valid date.`, proposalId);
  }
  return value;
}

function dateTime(value: string, field: string, proposalId: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CanonicalMigrationPlanningError("INVALID_DATE", `${field} is not a valid timestamp.`, proposalId);
  }
  return parsed.toISOString();
}

function proposalIssues(
  proposal: SubscriptionMigrationProposal,
  customer: CustomerMigrationReview,
): MigrationIssue[] {
  const unique = new Map<string, MigrationIssue>();
  for (const entry of [...proposal.issues, ...customer.issues]) {
    if (entry.severity === "decision" || entry.severity === "conflict") unique.set(entry.code, entry);
  }
  return [...unique.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function sourceEvidence(
  snapshot: LegacyBillingSnapshot,
  customer: CustomerMigrationReview,
  proposal: SubscriptionMigrationProposal,
): unknown {
  const customerId = proposal.customerId;
  const invoiceIds = new Set(proposal.invoiceIds);
  return {
    analysisDate: snapshot.analysisDate,
    customer: snapshot.customers.find((entry) => entry.id === customerId) ?? null,
    proposal,
    customerIssues: customer.issues,
    subscription: snapshot.subscriptions.find((entry) => entry.id === proposal.sourceId) ?? null,
    schedule: snapshot.recurringSchedules.find((entry) => entry.id === proposal.sourceId) ?? null,
    invoice: snapshot.invoices.find((entry) => entry.id === proposal.sourceId) ?? null,
    assignments: snapshot.assignments.filter((entry) => entry.customerId === customerId),
    billingAccounts: snapshot.billingAccounts.filter((entry) => entry.customerId === customerId),
    invoices: snapshot.invoices.filter((entry) => invoiceIds.has(entry.id)),
    billingInvoices: snapshot.billingInvoices.filter((entry) =>
      proposal.billingInvoiceIds.includes(entry.id),
    ),
    payments: snapshot.payments.filter((entry) => proposal.paymentIds.includes(entry.id)),
    catalogPrices: snapshot.catalogPrices,
  };
}

export function proposalSourceFingerprint(
  snapshot: LegacyBillingSnapshot,
  analysis: SubscriptionMigrationAnalysis,
  proposalId: string,
): string {
  for (const customer of analysis.customers) {
    const proposal = customer.proposals.find((entry) => entry.proposalId === proposalId);
    if (proposal) return migrationFingerprint(sourceEvidence(snapshot, customer, proposal));
  }
  throw new CanonicalMigrationPlanningError(
    "PROPOSAL_NOT_FOUND",
    `Proposal ${proposalId} is not present in the analyzed source snapshot.`,
    proposalId,
  );
}

function normalizeDecision(
  decision: ApprovedArrangementDecision,
  proposal: SubscriptionMigrationProposal,
  customer: CustomerMigrationReview,
  snapshot: LegacyBillingSnapshot,
  globallyClaimedAssignments: Set<string>,
): CanonicalMigrationPlanEntry {
  const proposalId = proposal.proposalId;
  if (!["manual_invoice", "stripe_autocharge"].includes(decision.collectionMethod)) {
    throw new CanonicalMigrationPlanningError(
      "INVALID_COLLECTION_METHOD",
      "collectionMethod must be manual_invoice or stripe_autocharge.",
      proposalId,
    );
  }
  if (!["draft", "pending_activation", "active", "paused", "canceled", "ended"].includes(
    decision.lifecycleStatus,
  )) {
    throw new CanonicalMigrationPlanningError(
      "INVALID_LIFECYCLE_STATUS",
      "lifecycleStatus is not supported.",
      proposalId,
    );
  }
  const currency = requiredText(decision.currency, "currency", proposalId).toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new CanonicalMigrationPlanningError("INVALID_CURRENCY", "currency must be a three-letter code.", proposalId);
  }
  if (![1, 3, 6, 12].includes(decision.billingIntervalMonths)) {
    throw new CanonicalMigrationPlanningError(
      "INVALID_INTERVAL",
      "billingIntervalMonths must be 1, 3, 6, or 12.",
      proposalId,
    );
  }
  if (!Number.isInteger(decision.gracePeriodDays) || decision.gracePeriodDays < 0) {
    throw new CanonicalMigrationPlanningError(
      "INVALID_GRACE_PERIOD",
      "gracePeriodDays must be a non-negative whole number.",
      proposalId,
    );
  }
  const commercialStartDate = dateOnly(decision.commercialStartDate, "commercialStartDate", proposalId);
  const billingAnchorDate = dateOnly(decision.billingAnchorDate, "billingAnchorDate", proposalId);
  const nextBillingDate = dateOnly(decision.nextBillingDate, "nextBillingDate", proposalId);
  if (billingAnchorDate < commercialStartDate || nextBillingDate < billingAnchorDate) {
    throw new CanonicalMigrationPlanningError(
      "INVALID_BILLING_DATES",
      "Commercial start, billing anchor, and next billing date must be chronological.",
      proposalId,
    );
  }
  const approvedAt = dateTime(decision.approvedAt, "approvedAt", proposalId);
  const defaultItemAmountPerCycle = exactMoney(
    decision.defaultItemAmountPerCycle,
    "defaultItemAmountPerCycle",
    proposalId,
  );
  const expectedTotalAmountPerCycle = exactMoney(
    decision.expectedTotalAmountPerCycle,
    "expectedTotalAmountPerCycle",
    proposalId,
  );
  if (!decision.items.length) {
    throw new CanonicalMigrationPlanningError(
      "NO_APPROVED_ITEMS",
      "At least one explicitly approved billable item is required.",
      proposalId,
    );
  }

  const assignmentsById = new Map(snapshot.assignments.map((entry) => [entry.id, entry]));
  const localAssignments = new Set<string>();
  const items = [...decision.items]
    .sort((left, right) => left.itemKey.localeCompare(right.itemKey))
    .map((item) => {
      const itemKey = requiredText(item.itemKey, "itemKey", proposalId);
      if (!["standard", "negotiated"].includes(item.classification)) {
        throw new CanonicalMigrationPlanningError(
          "INVALID_RATE_CLASSIFICATION",
          `Item ${itemKey} must be classified as standard or negotiated.`,
          proposalId,
        );
      }
      const assignmentIds = [...new Set(item.assignmentIds)].sort();
      if (!assignmentIds.length) {
        throw new CanonicalMigrationPlanningError(
          "ITEM_WITHOUT_ASSIGNMENT",
          `Item ${itemKey} requires at least one assignment.`,
          proposalId,
        );
      }
      for (const assignmentId of assignmentIds) {
        const assignment = assignmentsById.get(assignmentId);
        if (!assignment || assignment.customerId !== proposal.customerId) {
          throw new CanonicalMigrationPlanningError(
            "ASSIGNMENT_OWNERSHIP_MISMATCH",
            `Assignment ${assignmentId} does not belong to the proposal customer.`,
            proposalId,
          );
        }
        if (assignment.subscriptionItemId) {
          throw new CanonicalMigrationPlanningError(
            "ASSIGNMENT_ALREADY_CANONICAL",
            `Assignment ${assignmentId} is already linked to a canonical item.`,
            proposalId,
          );
        }
        if (localAssignments.has(assignmentId) || globallyClaimedAssignments.has(assignmentId)) {
          throw new CanonicalMigrationPlanningError(
            "DUPLICATE_ASSIGNMENT_MEMBERSHIP",
            `Assignment ${assignmentId} is approved for more than one canonical item.`,
            proposalId,
          );
        }
        localAssignments.add(assignmentId);
      }
      const serviceActivatedDate = dateOnly(item.serviceActivatedDate, "serviceActivatedDate", proposalId);
      const billingEffectiveFrom = dateOnly(item.billingEffectiveFrom, "billingEffectiveFrom", proposalId);
      const billingEffectiveUntil = item.billingEffectiveUntil
        ? dateOnly(item.billingEffectiveUntil, "billingEffectiveUntil", proposalId)
        : null;
      if (billingEffectiveFrom < serviceActivatedDate) {
        throw new CanonicalMigrationPlanningError(
          "INVALID_ITEM_DATES",
          `Item ${itemKey} bills before service activation.`,
          proposalId,
        );
      }
      if (billingEffectiveUntil && billingEffectiveUntil <= billingEffectiveFrom) {
        throw new CanonicalMigrationPlanningError(
          "INVALID_ITEM_DATES",
          `Item ${itemKey} has an invalid billing-effective range.`,
          proposalId,
        );
      }
      return {
        itemKey,
        label: requiredText(item.label, "item label", proposalId),
        assignmentIds,
        serviceActivatedDate,
        billingEffectiveFrom,
        billingEffectiveUntil,
        agreedAmountPerCycle: exactMoney(
          item.agreedAmountPerCycle,
          `item ${itemKey} agreedAmountPerCycle`,
          proposalId,
        ),
        classification: item.classification,
        changeReason: requiredText(item.changeReason, "changeReason", proposalId),
      };
    });
  const itemTotal = items.reduce((total, item) => total + moneyCents(item.agreedAmountPerCycle), 0);
  if (itemTotal !== moneyCents(expectedTotalAmountPerCycle)) {
    throw new CanonicalMigrationPlanningError(
      "ITEM_TOTAL_MISMATCH",
      "Approved item prices do not equal expectedTotalAmountPerCycle.",
      proposalId,
    );
  }
  for (const assignmentId of localAssignments) globallyClaimedAssignments.add(assignmentId);

  const requiredIssues = proposalIssues(proposal, customer);
  const resolutions = new Map(decision.issueResolutions.map((entry) => [entry.code, entry.explanation.trim()]));
  for (const required of requiredIssues) {
    if (!resolutions.get(required.code)) {
      throw new CanonicalMigrationPlanningError(
        "UNRESOLVED_REVIEW_ISSUE",
        `Issue ${required.code} requires a documented resolution before migration.`,
        proposalId,
      );
    }
  }

  const providerRelationship = decision.providerRelationship ?? null;
  if (decision.collectionMethod === "stripe_autocharge") {
    if (!providerRelationship) {
      throw new CanonicalMigrationPlanningError(
        "PROVIDER_RELATIONSHIP_REQUIRED",
        "Stripe autocharge migration requires a verified provider relationship.",
        proposalId,
      );
    }
    if (
      proposal.providerSubscriptionId
      && providerRelationship.externalSubscriptionId !== proposal.providerSubscriptionId
      && !resolutions.get("provider_relationship_override")
    ) {
      throw new CanonicalMigrationPlanningError(
        "PROVIDER_REFERENCE_MISMATCH",
        "The approved provider subscription differs from the source without a documented override.",
        proposalId,
      );
    }
  } else if (providerRelationship && !resolutions.get("provider_relationship_override")) {
    throw new CanonicalMigrationPlanningError(
      "UNEXPECTED_PROVIDER_RELATIONSHIP",
      "Manual collection cannot receive a provider subscription without a documented override.",
      proposalId,
    );
  }

  if (providerRelationship && providerRelationship.provider !== "stripe") {
    throw new CanonicalMigrationPlanningError(
      "INVALID_PROVIDER",
      "Only verified Stripe provider relationships are supported in Phase 2B.",
      proposalId,
    );
  }
  const providerItemIds = new Set<string>();
  const providerRateGroups = new Set<string>();
  const normalizedProvider = providerRelationship ? {
    provider: "stripe" as const,
    externalSubscriptionId: requiredText(
      providerRelationship.externalSubscriptionId,
      "externalSubscriptionId",
      proposalId,
    ),
    providerStatus: providerRelationship.providerStatus?.trim() || null,
    activatedAt: dateTime(providerRelationship.activatedAt, "provider activatedAt", proposalId),
    providerItems: [...providerRelationship.providerItems]
      .sort((left, right) => left.externalSubscriptionItemId.localeCompare(right.externalSubscriptionItemId))
      .map((item) => {
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          throw new CanonicalMigrationPlanningError(
            "INVALID_PROVIDER_QUANTITY",
            "Provider item quantity must be a positive whole number.",
            proposalId,
          );
        }
        const externalSubscriptionItemId = requiredText(
          item.externalSubscriptionItemId,
          "externalSubscriptionItemId",
          proposalId,
        );
        const rateGroupFingerprint = requiredText(
          item.rateGroupFingerprint,
          "rateGroupFingerprint",
          proposalId,
        );
        if (providerItemIds.has(externalSubscriptionItemId)) {
          throw new CanonicalMigrationPlanningError(
            "DUPLICATE_PROVIDER_ITEM",
            `Provider item ${externalSubscriptionItemId} appears more than once.`,
            proposalId,
          );
        }
        if (providerRateGroups.has(rateGroupFingerprint)) {
          throw new CanonicalMigrationPlanningError(
            "DUPLICATE_PROVIDER_RATE_GROUP",
            `Provider rate group ${rateGroupFingerprint} appears more than once.`,
            proposalId,
          );
        }
        providerItemIds.add(externalSubscriptionItemId);
        providerRateGroups.add(rateGroupFingerprint);
        return {
          externalSubscriptionItemId,
          externalPriceId: requiredText(item.externalPriceId, "externalPriceId", proposalId),
          agreedAmountPerCycle: exactMoney(
            item.agreedAmountPerCycle,
            "provider agreedAmountPerCycle",
            proposalId,
          ),
          quantity: item.quantity,
          rateGroupFingerprint,
        };
      }),
  } : null;

  return {
    migrationKey: `phase2b:${proposal.sourceKind}:${proposal.sourceId}`,
    sourceFingerprint: migrationFingerprint(sourceEvidence(snapshot, customer, proposal)),
    sourceKind: proposal.sourceKind,
    sourceId: proposal.sourceId,
    proposalId,
    customerId: proposal.customerId,
    sourceReviewStatus: proposal.reviewStatus,
    sourceCycleAmount: proposal.sourceCycleAmount,
    proposedCycleAmount: proposal.proposedCycleAmount,
    approvedBy: requiredText(decision.approvedBy, "approvedBy", proposalId),
    approvedAt,
    approvalReason: requiredText(decision.approvalReason, "approvalReason", proposalId),
    resolvedIssues: [...decision.issueResolutions]
      .map((entry) => ({ code: entry.code.trim(), explanation: entry.explanation.trim() }))
      .filter((entry) => entry.code && entry.explanation)
      .sort((left, right) => left.code.localeCompare(right.code)),
    target: {
      name: requiredText(decision.name, "name", proposalId),
      reference: requiredText(decision.reference, "reference", proposalId),
      collectionMethod: decision.collectionMethod,
      lifecycleStatus: decision.lifecycleStatus,
      billingIntervalMonths: decision.billingIntervalMonths,
      currency,
      commercialStartDate,
      billingAnchorDate,
      nextBillingDate,
      gracePeriodDays: decision.gracePeriodDays,
      defaultItemAmountPerCycle,
      expectedTotalAmountPerCycle,
      items,
      providerRelationship: normalizedProvider,
    },
    historicalReferences: {
      assignmentIds: [...localAssignments].sort(),
      invoiceIds: [...proposal.invoiceIds].sort(),
      billingInvoiceIds: [...proposal.billingInvoiceIds].sort(),
      paymentIds: [...proposal.paymentIds].sort(),
    },
  };
}

export function createCanonicalMigrationPlan(
  snapshot: LegacyBillingSnapshot,
  approval: CanonicalMigrationApproval,
): CanonicalMigrationPlan {
  if (approval.schemaVersion !== MIGRATION_APPROVAL_SCHEMA_VERSION) {
    throw new CanonicalMigrationPlanningError("INVALID_APPROVAL_SCHEMA", "Unsupported approval schema.");
  }
  const sourceFingerprint = migrationSourceFingerprint(snapshot);
  if (approval.sourceFingerprint !== sourceFingerprint) {
    throw new CanonicalMigrationPlanningError(
      "STALE_SOURCE_SNAPSHOT",
      "The approval does not match this source snapshot. Regenerate and review the plan.",
    );
  }
  const analysis = analyzeSubscriptionMigration(snapshot);
  const proposalIndex = new Map<string, {
    proposal: SubscriptionMigrationProposal;
    customer: CustomerMigrationReview;
  }>();
  for (const customer of analysis.customers) {
    for (const proposal of customer.proposals) proposalIndex.set(proposal.proposalId, { proposal, customer });
  }
  const decisionIds = new Set<string>();
  const globallyClaimedAssignments = new Set<string>();
  const entries = [...approval.decisions]
    .sort((left, right) => left.proposalId.localeCompare(right.proposalId))
    .map((decision) => {
      if (decisionIds.has(decision.proposalId)) {
        throw new CanonicalMigrationPlanningError(
          "DUPLICATE_APPROVAL",
          "An arrangement may have only one approval decision.",
          decision.proposalId,
        );
      }
      decisionIds.add(decision.proposalId);
      const indexed = proposalIndex.get(decision.proposalId);
      if (!indexed) {
        throw new CanonicalMigrationPlanningError(
          "PROPOSAL_NOT_FOUND",
          "The approved proposal is absent from the source analysis.",
          decision.proposalId,
        );
      }
      return normalizeDecision(
        decision,
        indexed.proposal,
        indexed.customer,
        snapshot,
        globallyClaimedAssignments,
      );
    });

  const providerReferences = new Set<string>();
  for (const entry of entries) {
    const externalId = entry.target.providerRelationship?.externalSubscriptionId;
    if (externalId && providerReferences.has(externalId)) {
      throw new CanonicalMigrationPlanningError(
        "DUPLICATE_PROVIDER_RELATIONSHIP",
        "A provider subscription cannot be approved for multiple canonical subscriptions.",
        entry.proposalId,
      );
    }
    if (externalId) providerReferences.add(externalId);
  }

  const awaitingApproval = [...proposalIndex.values()]
    .filter(({ proposal }) => !decisionIds.has(proposal.proposalId))
    .map(({ proposal, customer }) => ({
      proposalId: proposal.proposalId,
      customerId: proposal.customerId,
      reviewStatus: proposal.reviewStatus,
      issueCodes: proposalIssues(proposal, customer).map((entry) => entry.code),
    }))
    .sort((left, right) => left.proposalId.localeCompare(right.proposalId));
  const planWithoutFingerprint = {
    schemaVersion: MIGRATION_PLAN_SCHEMA_VERSION,
    sourceSchemaVersion: snapshot.schemaVersion,
    analysisDate: snapshot.analysisDate,
    sourceFingerprint,
    entries,
    awaitingApproval,
  };
  return {
    ...planWithoutFingerprint,
    planFingerprint: migrationFingerprint(planWithoutFingerprint),
  };
}

export function assertCanonicalMigrationPlanIntegrity(plan: CanonicalMigrationPlan): void {
  const { planFingerprint, ...withoutFingerprint } = plan;
  if (migrationFingerprint(withoutFingerprint) !== planFingerprint) {
    throw new CanonicalMigrationPlanningError(
      "PLAN_FINGERPRINT_MISMATCH",
      "The executable migration plan has changed since approval.",
    );
  }
}
