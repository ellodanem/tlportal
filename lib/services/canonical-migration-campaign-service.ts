import "server-only";

import { type InvoiceMigrationClassification, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  createCanonicalMigrationPlan,
  migrationFingerprint,
  migrationSourceFingerprint,
  MIGRATION_APPROVAL_SCHEMA_VERSION,
  type ApprovedArrangementDecision,
  type CanonicalMigrationPlan,
} from "@/lib/domain/canonical-subscription-migration";
import {
  analyzeSubscriptionMigration,
  type CustomerMigrationReview,
  type LegacyBillingSnapshot,
  type SubscriptionMigrationProposal,
} from "@/lib/domain/subscription-migration-analysis";
import {
  APPLY_MIGRATION_CONFIRMATION,
  CanonicalMigrationExecutionError,
  executeCanonicalMigrationPlan,
} from "@/lib/services/canonical-subscription-migration-service";
import { loadLegacyBillingSnapshot } from "@/lib/services/subscription-migration-analysis-service";

export const CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_FLAG = "CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED";

export type CanonicalMigrationCampaignEnvironment = {
  CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED?: string;
};

export type MigrationCampaignCandidate = {
  proposalId: string;
  customerId: string;
  customerLabel: string;
  sourceKind: SubscriptionMigrationProposal["sourceKind"];
  sourceId: string;
  collectionMethod: SubscriptionMigrationProposal["collectionMethod"];
  billingIntervalMonths: number;
  currency: string;
  billingAnchorDate: string | null;
  nextBillingDate: string | null;
  paidThroughDate: string | null;
  outstandingBalance: string;
  nonSubscriptionOutstandingBalance: string;
  serviceCount: number;
  cycleAmount: string | null;
  normalizedMonthlyAmount: string | null;
  providerSubscriptionId: string | null;
  lifecycleStatus: string;
  reviewStatus: string;
  eligibility: "eligible" | "review_required" | "blocked" | "migrated";
  blockers: string[];
  issueMessages: string[];
  migrationStatus: string | null;
  targetSubscriptionId: string | null;
};

export type MigrationCampaignDashboard = {
  analysisDate: string;
  sourceFingerprint: string;
  candidates: MigrationCampaignCandidate[];
  counts: {
    total: number;
    eligible: number;
    migrated: number;
    reviewRequired: number;
    blocked: number;
    manual: number;
    stripe: number;
    stripeAttention: number;
    legacyAuthorityRemaining: number;
  };
  campaigns: Array<{
    id: string;
    title: string;
    status: string;
    approvedAt: Date;
    approvedBy: string;
    entryCounts: Record<string, number>;
  }>;
};

export type StandaloneInvoiceMigrationReview = {
  invoiceId: string;
  customerId: string;
  customerLabel: string;
  invoiceNumber: string | null;
  issueDate: Date;
  currency: string;
  total: string;
  amountDue: string;
  status: string;
  classification: InvoiceMigrationClassification;
  classificationUpdatedAt: Date | null;
  recentClassifications: Array<{
    classification: InvoiceMigrationClassification;
    reason: string;
    classifiedBy: string;
    createdAt: Date;
  }>;
};

export type OwnerMigrationConfirmations = {
  sourceAndServicesReviewed: boolean;
  paidThroughAndRenewalReviewed: boolean;
  financialHistoryPreserved: boolean;
  legacyAuthorityRetained: boolean;
};

type CampaignEntryStatus = "approved" | "executing" | "migrated" | "blocked" | "failed" | "skipped";

export class CanonicalMigrationCampaignError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function campaignError(code: string, message: string): never {
  throw new CanonicalMigrationCampaignError(code, message);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateOnly(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

function cents(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function money(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function customerLabel(customer: { company: string | null; firstName: string | null; lastName: string | null }): string {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Unnamed customer";
}

const standaloneInvoiceWhere: Prisma.InvoiceWhereInput = {
  customerId: { not: null },
  customerSubscriptionId: null,
  recurringScheduleId: null,
  billingInvoiceId: null,
  archivedAt: null,
  status: { notIn: ["void", "written_off"] },
};

/**
 * The campaign must not infer recurring authority from a one-off document.
 * A classified invoice also cannot compete with an active schedule or legacy/
 * Stripe subscription for the same customer.
 */
function isCampaignProposal(snapshot: LegacyBillingSnapshot, proposal: SubscriptionMigrationProposal): boolean {
  if (proposal.sourceKind !== "manual_invoice") return true;
  const invoice = snapshot.invoices.find((entry) => entry.id === proposal.sourceId);
  if (invoice?.migrationClassification !== "recurring_evidence") return false;
  const hasActiveSchedule = snapshot.recurringSchedules.some((schedule) =>
    schedule.customerId === proposal.customerId && schedule.status === "active",
  );
  const hasCurrentSubscription = snapshot.subscriptions.some((subscription) =>
    subscription.customerId === proposal.customerId && subscription.status !== "canceled",
  );
  return !hasActiveSchedule && !hasCurrentSubscription;
}

/**
 * A one-off invoice may document hardware, installation, a deposit, or a
 * historical subscription period. It is deliberately kept out of migration
 * planning until the billing owner classifies it.
 */
export async function listStandaloneInvoiceMigrationReviews(): Promise<StandaloneInvoiceMigrationReview[]> {
  const invoices = await prisma.invoice.findMany({
    where: standaloneInvoiceWhere,
    select: {
      id: true,
      number: true,
      issueDate: true,
      currency: true,
      total: true,
      amountDue: true,
      status: true,
      migrationClassification: true,
      migrationClassificationUpdatedAt: true,
      customer: { select: { id: true, company: true, firstName: true, lastName: true } },
      migrationClassificationAudits: {
        take: 3,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          classification: true,
          reason: true,
          createdAt: true,
          classifiedBy: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: [{ issueDate: "desc" }, { id: "desc" }],
  });
  return invoices.flatMap((invoice) => invoice.customer ? [{
    invoiceId: invoice.id,
    customerId: invoice.customer.id,
    customerLabel: customerLabel(invoice.customer),
    invoiceNumber: invoice.number,
    issueDate: invoice.issueDate,
    currency: invoice.currency,
    total: invoice.total.toFixed(2),
    amountDue: invoice.amountDue.toFixed(2),
    status: invoice.status,
    classification: invoice.migrationClassification,
    classificationUpdatedAt: invoice.migrationClassificationUpdatedAt,
    recentClassifications: invoice.migrationClassificationAudits.map((audit) => ({
      classification: audit.classification,
      reason: audit.reason,
      classifiedBy: audit.classifiedBy.name?.trim() || audit.classifiedBy.email,
      createdAt: audit.createdAt,
    })),
  }] : []);
}

export async function classifyStandaloneInvoiceForMigration(input: {
  invoiceId: string;
  classification: Extract<InvoiceMigrationClassification, "non_subscription" | "recurring_evidence">;
  reason: string;
  ownerUserId: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 12) {
    campaignError("CLASSIFICATION_REASON_REQUIRED", "Provide a specific owner reason for this invoice classification.");
  }
  if (!["non_subscription", "recurring_evidence"].includes(input.classification)) {
    campaignError("INVALID_INVOICE_CLASSIFICATION", "Choose either non-subscription history or recurring subscription evidence.");
  }
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, ...standaloneInvoiceWhere },
      select: { id: true },
    });
    if (!invoice) {
      campaignError("INVOICE_NOT_CLASSIFIABLE", "This invoice is linked to a subscription, recurring schedule, provider mirror, or no longer available for standalone review.");
    }
    const updatedAt = new Date();
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        migrationClassification: input.classification,
        migrationClassificationUpdatedAt: updatedAt,
      },
    });
    await tx.invoiceMigrationClassificationAudit.create({
      data: {
        invoiceId: invoice.id,
        classification: input.classification,
        reason,
        classifiedById: input.ownerUserId,
      },
    });
    return { invoiceId: invoice.id, classification: input.classification, classifiedAt: updatedAt };
  });
}

function providerReviewRequired(proposal: SubscriptionMigrationProposal): boolean {
  return proposal.collectionMethod === "stripe_autocharge";
}

function candidateBlockers(
  snapshot: LegacyBillingSnapshot,
  customer: CustomerMigrationReview,
  proposal: SubscriptionMigrationProposal,
  existing: { status: string; targetSubscriptionId: string | null } | undefined,
): { eligibility: MigrationCampaignCandidate["eligibility"]; blockers: string[] } {
  if (existing?.status === "completed") {
    return { eligibility: "migrated", blockers: ["A canonical shadow has already been created for this legacy arrangement."] };
  }
  const blockers: string[] = [];
  if (!isCampaignProposal(snapshot, proposal)) {
    blockers.push("Standalone invoices require explicit recurring-evidence classification and cannot compete with an active recurring arrangement.");
  }
  if (existing) blockers.push(`Previous migration attempt is ${existing.status.replaceAll("_", " ")}; review it before retrying.`);
  if (proposal.reviewStatus !== "ready_for_review") {
    blockers.push("Commercial terms, service mapping, or payment coverage still require review.");
  }
  if (!proposal.billingAnchorDate || !proposal.nextBillingDate) {
    blockers.push("A verified billing anchor and next renewal date are required.");
  }
  if (!proposal.proposedItems.length || proposal.proposedItems.some((item) => item.proposedCycleAmount == null || item.rateClassification === "requires_confirmation")) {
    blockers.push("Every active service needs an explicit agreed recurring price.");
  }
  if (!proposal.proposedCycleAmount) blockers.push("The recurring cycle amount is unresolved.");
  if (customer.subscriptionOutstandingNativeBalance !== "0.00") {
    blockers.push("Outstanding native balance requires owner review; migration never rewrites or settles it.");
  }
  if (proposal.sourceKind === "manual_invoice") {
    blockers.push("Standalone invoice coverage needs explicit staff-confirmed start and end dates before it can be migrated.");
  }
  if (providerReviewRequired(proposal)) {
    blockers.push("Stripe provider status, paid-through period, future collection, and exact price evidence require separate provider review. No Stripe subscription will be changed here.");
  }
  if (blockers.length) {
    return {
      eligibility: proposal.reviewStatus === "ready_for_review" && blockers.every((entry) => entry.startsWith("Stripe provider"))
        ? "review_required"
        : proposal.reviewStatus === "ready_for_review" ? "blocked" : "review_required",
      blockers,
    };
  }
  const assignmentDates = new Map(snapshot.assignments.map((assignment) => [assignment.id, assignment.nextDueDate]));
  if (proposal.proposedItems.some((item) => !assignmentDates.has(item.serviceAssignmentId))) {
    return { eligibility: "blocked", blockers: ["One or more reviewed service assignments no longer exist."] };
  }
  return { eligibility: "eligible", blockers: [] };
}

async function snapshotAndAnalysis() {
  const analysisDate = new Date().toISOString().slice(0, 10);
  const snapshot = await loadLegacyBillingSnapshot(analysisDate);
  return { snapshot, analysis: analyzeSubscriptionMigration(snapshot) };
}

function candidateFor(
  snapshot: LegacyBillingSnapshot,
  customer: CustomerMigrationReview,
  proposal: SubscriptionMigrationProposal,
  customerName: string,
  existing: { status: string; targetSubscriptionId: string | null } | undefined,
): MigrationCampaignCandidate {
  const evaluation = candidateBlockers(snapshot, customer, proposal, existing);
  const stripeSubscription = snapshot.subscriptions.find((entry) => entry.id === proposal.sourceId);
  return {
    proposalId: proposal.proposalId,
    customerId: proposal.customerId,
    customerLabel: customerName,
    sourceKind: proposal.sourceKind,
    sourceId: proposal.sourceId,
    collectionMethod: proposal.collectionMethod,
    billingIntervalMonths: proposal.billingIntervalMonths,
    currency: proposal.currency,
    billingAnchorDate: dateOnly(proposal.billingAnchorDate),
    nextBillingDate: dateOnly(proposal.nextBillingDate),
    paidThroughDate: proposal.collectionMethod === "stripe_autocharge"
      ? dateOnly(stripeSubscription?.currentPeriodEnd ?? null)
      : dateOnly(proposal.nextBillingDate),
    outstandingBalance: customer.subscriptionOutstandingNativeBalance,
    nonSubscriptionOutstandingBalance: customer.nonSubscriptionOutstandingNativeBalance,
    serviceCount: proposal.proposedItems.length,
    cycleAmount: proposal.proposedCycleAmount,
    normalizedMonthlyAmount: proposal.normalizedMonthlyAmount,
    providerSubscriptionId: proposal.providerSubscriptionId,
    lifecycleStatus: proposal.lifecycleStatus,
    reviewStatus: proposal.reviewStatus,
    eligibility: evaluation.eligibility,
    blockers: evaluation.blockers,
    issueMessages: [...customer.issues, ...proposal.issues].map((issue) => issue.message),
    migrationStatus: existing?.status ?? null,
    targetSubscriptionId: existing?.targetSubscriptionId ?? null,
  };
}

export async function getCanonicalMigrationCampaignDashboard(): Promise<MigrationCampaignDashboard> {
  const { snapshot, analysis } = await snapshotAndAnalysis();
  const customerIds = analysis.customers.map((customer) => customer.customerId);
  const [customers, ledgers, campaigns] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, company: true, firstName: true, lastName: true },
    }),
    prisma.canonicalMigrationLedger.findMany({
      select: { sourceKind: true, sourceId: true, status: true, targetSubscriptionId: true },
    }),
    prisma.canonicalMigrationCampaign.findMany({
      take: 12,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        approvedAt: true,
        approvedBy: { select: { name: true, email: true } },
        entries: { select: { status: true } },
      },
    }),
  ]);
  const customerNames = new Map(customers.map((customer) => [customer.id, customerLabel(customer)]));
  const ledgerBySource = new Map(ledgers.map((entry) => [`${entry.sourceKind}:${entry.sourceId}`, entry]));
  const candidates = analysis.customers.flatMap((customer) => customer.proposals
    .filter((proposal) => isCampaignProposal(snapshot, proposal))
    .map((proposal) => candidateFor(
    snapshot,
    customer,
    proposal,
    customerNames.get(customer.customerId) ?? "Unnamed customer",
    ledgerBySource.get(`${proposal.sourceKind}:${proposal.sourceId}`),
  ))).sort((left, right) => left.customerLabel.localeCompare(right.customerLabel) || left.proposalId.localeCompare(right.proposalId));
  const count = (predicate: (candidate: MigrationCampaignCandidate) => boolean) => candidates.filter(predicate).length;
  return {
    analysisDate: snapshot.analysisDate,
    sourceFingerprint: migrationSourceFingerprint(snapshot),
    candidates,
    counts: {
      total: candidates.length,
      eligible: count((candidate) => candidate.eligibility === "eligible"),
      migrated: count((candidate) => candidate.eligibility === "migrated"),
      reviewRequired: count((candidate) => candidate.eligibility === "review_required"),
      blocked: count((candidate) => candidate.eligibility === "blocked"),
      manual: count((candidate) => candidate.collectionMethod === "manual_invoice"),
      stripe: count((candidate) => candidate.collectionMethod === "stripe_autocharge"),
      stripeAttention: count((candidate) => candidate.collectionMethod === "stripe_autocharge" && candidate.eligibility !== "migrated"),
      legacyAuthorityRemaining: count((candidate) => candidate.eligibility !== "migrated"),
    },
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      approvedAt: campaign.approvedAt,
      approvedBy: campaign.approvedBy.name?.trim() || campaign.approvedBy.email,
      entryCounts: campaign.entries.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.status] = (counts[entry.status] ?? 0) + 1;
        return counts;
      }, {}),
    })),
  };
}

function decisionForCandidate(
  snapshot: LegacyBillingSnapshot,
  customer: CustomerMigrationReview,
  proposal: SubscriptionMigrationProposal,
  approvedBy: string,
  approvedAt: string,
  approvalReason: string,
): ApprovedArrangementDecision {
  const anchor = dateOnly(proposal.billingAnchorDate);
  const next = dateOnly(proposal.nextBillingDate);
  if (!anchor || !next || !proposal.proposedCycleAmount || !proposal.proposedItems.length) {
    campaignError("CANDIDATE_NOT_ELIGIBLE", "The selected arrangement does not have complete commercial evidence.");
  }
  const assignmentById = new Map(snapshot.assignments.map((assignment) => [assignment.id, assignment]));
  const itemAmounts = proposal.proposedItems.map((item) => item.proposedCycleAmount);
  if (itemAmounts.some((amount): amount is null => amount == null)) {
    campaignError("CANDIDATE_NOT_ELIGIBLE", "Every selected service requires an exact cycle price.");
  }
  const approvedItemAmounts = itemAmounts as string[];
  if (approvedItemAmounts.reduce((sum, amount) => sum + cents(amount), 0) !== cents(proposal.proposedCycleAmount)) {
    campaignError("CANDIDATE_NOT_ELIGIBLE", "Service rates do not reconcile to the source recurring total.");
  }
  return {
    proposalId: proposal.proposalId,
    approvedBy,
    approvedAt,
    approvalReason,
    name: `Legacy migration ${proposal.sourceKind.replaceAll("_", " ")}`,
    reference: `migration-${proposal.sourceKind}-${proposal.sourceId}`,
    collectionMethod: "manual_invoice",
    lifecycleStatus: proposal.lifecycleStatus === "paused" ? "paused" : "active",
    billingIntervalMonths: proposal.billingIntervalMonths as 1 | 3 | 6 | 12,
    currency: proposal.currency,
    commercialStartDate: anchor,
    billingAnchorDate: anchor,
    nextBillingDate: next,
    gracePeriodDays: 7,
    defaultItemAmountPerCycle: approvedItemAmounts[0],
    expectedTotalAmountPerCycle: proposal.proposedCycleAmount,
    items: proposal.proposedItems.map((item, index) => {
      const assignment = assignmentById.get(item.serviceAssignmentId);
      if (!assignment) campaignError("SOURCE_CHANGED", "A selected service assignment is no longer available.");
      return {
        itemKey: `assignment-${item.serviceAssignmentId}`,
        label: `GPS tracking service ${index + 1}`,
        assignmentIds: [item.serviceAssignmentId],
        serviceActivatedDate: dateOnly(assignment.startDate) ?? anchor,
        billingEffectiveFrom: anchor,
        billingEffectiveUntil: null,
        agreedAmountPerCycle: item.proposedCycleAmount!,
        classification: item.rateClassification === "negotiated" ? "negotiated" : "standard",
        changeReason: "Owner-approved legacy migration; existing recurring terms preserved.",
      };
    }),
    providerRelationship: null,
    issueResolutions: [],
  };
}

function findProposal(
  analysis: ReturnType<typeof analyzeSubscriptionMigration>,
  proposalId: string,
): { customer: CustomerMigrationReview; proposal: SubscriptionMigrationProposal } | null {
  // Dynamic route parameters are normally decoded by Next.js, but a copied
  // encoded URL can still reach this layer as `manual-invoice%3A…`. Proposal
  // IDs deliberately include a colon, so normalize once before looking up the
  // exact source-backed proposal.
  let normalizedProposalId = proposalId;
  try {
    normalizedProposalId = decodeURIComponent(proposalId);
  } catch {
    // Keep the original value: malformed user input must remain a not-found
    // proposal rather than becoming a route error.
  }
  for (const customer of analysis.customers) {
    const proposal = customer.proposals.find((entry) => entry.proposalId === normalizedProposalId);
    if (proposal) return { customer, proposal };
  }
  return null;
}

export async function createOwnerApprovedMigrationCampaign(input: {
  proposalIds: string[];
  title: string;
  approvalReason: string;
  ownerUserId: string;
  ownerEmail: string;
  confirmations: OwnerMigrationConfirmations;
}) {
  const proposalIds = [...new Set(input.proposalIds.map((value) => value.trim()).filter(Boolean))].sort();
  if (!proposalIds.length) campaignError("NO_SELECTION", "Select at least one eligible legacy arrangement.");
  if (!input.title.trim() || !input.approvalReason.trim()) {
    campaignError("APPROVAL_DETAILS_REQUIRED", "A campaign title and owner approval reason are required.");
  }
  if (!Object.values(input.confirmations).every(Boolean)) {
    campaignError("OWNER_CONFIRMATIONS_REQUIRED", "Every owner migration confirmation is required.");
  }
  const { snapshot, analysis } = await snapshotAndAnalysis();
  const existing = await prisma.canonicalMigrationLedger.findMany({
    where: { OR: proposalIds.map((proposalId) => {
      const found = findProposal(analysis, proposalId);
      return found ? { sourceKind: found.proposal.sourceKind, sourceId: found.proposal.sourceId } : { id: "__missing__" };
    }) },
    select: { sourceKind: true, sourceId: true, status: true, targetSubscriptionId: true },
  });
  const existingBySource = new Map(existing.map((entry) => [`${entry.sourceKind}:${entry.sourceId}`, entry]));
  const approvedAt = new Date().toISOString();
  const plans = proposalIds.map((proposalId) => {
    const found = findProposal(analysis, proposalId);
    if (!found) campaignError("PROPOSAL_NOT_FOUND", "A selected legacy arrangement no longer exists in the review.");
    const existingLedger = existingBySource.get(`${found.proposal.sourceKind}:${found.proposal.sourceId}`);
    const evaluation = candidateBlockers(snapshot, found.customer, found.proposal, existingLedger);
    if (evaluation.eligibility !== "eligible") {
      campaignError("CANDIDATE_NOT_ELIGIBLE", `This arrangement cannot be approved: ${evaluation.blockers.join(" ")}`);
    }
    const decision = decisionForCandidate(
      snapshot,
      found.customer,
      found.proposal,
      input.ownerEmail,
      approvedAt,
      input.approvalReason.trim(),
    );
    return createCanonicalMigrationPlan(snapshot, {
      schemaVersion: MIGRATION_APPROVAL_SCHEMA_VERSION,
      sourceFingerprint: migrationSourceFingerprint(snapshot),
      decisions: [decision],
    });
  });
  const planFingerprint = migrationFingerprint(plans.map((plan) => plan.planFingerprint));
  return prisma.canonicalMigrationCampaign.create({
    data: {
      title: input.title.trim(),
      sourceAnalysisDate: snapshot.analysisDate,
      sourceFingerprint: migrationSourceFingerprint(snapshot),
      planFingerprint,
      ownerConfirmations: jsonValue(input.confirmations),
      approvalReason: input.approvalReason.trim(),
      createdById: input.ownerUserId,
      approvedById: input.ownerUserId,
      approvedAt: new Date(approvedAt),
      entries: {
        create: plans.map((plan) => {
          const entry = plan.entries[0]!;
          return {
            proposalId: entry.proposalId,
            migrationKey: entry.migrationKey,
            customerId: entry.customerId,
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
            sourceFingerprint: entry.sourceFingerprint,
            planFingerprint: plan.planFingerprint,
            approvedPlan: jsonValue(plan),
          };
        }),
      },
    },
    include: { entries: { orderBy: { proposalId: "asc" } } },
  });
}

export async function getCanonicalMigrationProposalReview(proposalId: string) {
  const { snapshot, analysis } = await snapshotAndAnalysis();
  const found = findProposal(analysis, proposalId);
  if (!found || !isCampaignProposal(snapshot, found.proposal)) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: found.customer.customerId },
    select: { id: true, company: true, firstName: true, lastName: true },
  });
  const existing = await prisma.canonicalMigrationLedger.findUnique({
    where: { sourceKind_sourceId: { sourceKind: found.proposal.sourceKind, sourceId: found.proposal.sourceId } },
    select: { status: true, targetSubscriptionId: true },
  });
  const assignments = found.proposal.proposedItems.map((item) => {
    const source = snapshot.assignments.find((assignment) => assignment.id === item.serviceAssignmentId);
    return {
      ...item,
      serviceActivatedDate: dateOnly(source?.startDate ?? null),
      nextDueDate: dateOnly(source?.nextDueDate ?? null),
    };
  });
  return {
    candidate: candidateFor(
      snapshot,
      found.customer,
      found.proposal,
      customer ? customerLabel(customer) : "Unnamed customer",
      existing ?? undefined,
    ),
    customer: found.customer,
    proposal: found.proposal,
    assignments,
    requiredIssues: [...found.customer.issues, ...found.proposal.issues]
      .filter((issue) => issue.severity === "decision" || issue.severity === "conflict")
      .filter((issue, index, values) => values.findIndex((value) => value.code === issue.code) === index),
  };
}

function requiredConfirmed(value: boolean, label: string): void {
  if (!value) campaignError("OWNER_CONFIRMATIONS_REQUIRED", `${label} must be explicitly confirmed.`);
}

export async function createOwnerApprovedIndividualMigrationCampaign(input: {
  proposalId: string;
  title: string;
  approvalReason: string;
  ownerUserId: string;
  ownerEmail: string;
  billingAnchorDate: string;
  nextBillingDate: string;
  commercialStartDate: string;
  gracePeriodDays: number;
  items: Array<{
    assignmentId: string;
    label: string;
    serviceActivatedDate: string;
    agreedAmountPerCycle: string;
    classification: "standard" | "negotiated";
  }>;
  issueResolutions: Array<{ code: string; explanation: string }>;
  sourceInvoiceCoverage?: { periodStart: string; periodEnd: string; explicitlyConfirmed: true } | null;
  providerEvidence?: {
    externalSubscriptionId: string;
    providerStatus: string | null;
    activatedAt: string;
    items: Array<{
      externalSubscriptionItemId: string;
      externalPriceId: string;
      agreedAmountPerCycle: string;
      quantity: number;
      rateGroupFingerprint: string;
    }>;
  } | null;
  confirmations: OwnerMigrationConfirmations & {
    outstandingBalanceReviewed: boolean;
    sourceCoverageReviewed: boolean;
    stripeProviderReviewed: boolean;
    futureStripeCollectionReviewed: boolean;
  };
}) {
  if (!input.title.trim() || !input.approvalReason.trim()) {
    campaignError("APPROVAL_DETAILS_REQUIRED", "A campaign title and owner approval reason are required.");
  }
  requiredConfirmed(input.confirmations.sourceAndServicesReviewed, "Source terms and services");
  requiredConfirmed(input.confirmations.paidThroughAndRenewalReviewed, "Paid-through evidence and next renewal");
  requiredConfirmed(input.confirmations.financialHistoryPreserved, "Financial history preservation");
  requiredConfirmed(input.confirmations.legacyAuthorityRetained, "Legacy authority retention");
  const { snapshot, analysis } = await snapshotAndAnalysis();
  const found = findProposal(analysis, input.proposalId);
  if (!found) campaignError("PROPOSAL_NOT_FOUND", "This legacy arrangement is no longer available for review.");
  if (!isCampaignProposal(snapshot, found.proposal)) {
    campaignError("INVOICE_NOT_APPROVED_AS_RECURRING_EVIDENCE", "This standalone invoice is not approved as recurring subscription evidence for campaign migration.");
  }
  const existingLedger = await prisma.canonicalMigrationLedger.findUnique({
    where: { sourceKind_sourceId: { sourceKind: found.proposal.sourceKind, sourceId: found.proposal.sourceId } },
    select: { id: true, status: true },
  });
  if (existingLedger) campaignError("MIGRATION_ALREADY_RECORDED", "This source arrangement already has a migration ledger and must be resumed or reviewed there.");
  const existingCampaignEntry = await prisma.canonicalMigrationCampaignEntry.findFirst({
    where: {
      sourceKind: found.proposal.sourceKind,
      sourceId: found.proposal.sourceId,
      status: { in: ["approved", "executing", "migrated"] },
    },
    select: { id: true },
  });
  if (existingCampaignEntry) campaignError("MIGRATION_ALREADY_APPROVED", "This source arrangement is already present in an approved migration campaign.");
  if (found.customer.subscriptionOutstandingNativeBalance !== "0.00") {
    requiredConfirmed(input.confirmations.outstandingBalanceReviewed, "Outstanding balance review");
  }
  if (found.proposal.sourceKind === "manual_invoice") {
    requiredConfirmed(input.confirmations.sourceCoverageReviewed, "Invoice coverage period");
    if (!input.sourceInvoiceCoverage) campaignError("SOURCE_INVOICE_COVERAGE_REQUIRED", "Invoice coverage start and end dates must be explicitly confirmed.");
    if (
      input.sourceInvoiceCoverage.periodStart !== input.billingAnchorDate
      || input.sourceInvoiceCoverage.periodEnd !== input.nextBillingDate
    ) {
      campaignError(
        "SOURCE_INVOICE_COVERAGE_MISMATCH",
        "The confirmed invoice coverage must match the approved billing anchor and next renewal date.",
      );
    }
  }
  if (found.proposal.collectionMethod === "stripe_autocharge") {
    requiredConfirmed(input.confirmations.stripeProviderReviewed, "Stripe provider evidence");
    requiredConfirmed(input.confirmations.futureStripeCollectionReviewed, "Future Stripe collection review");
    if (!input.providerEvidence || !input.providerEvidence.items.length) {
      campaignError("STRIPE_PROVIDER_REVIEW_REQUIRED", "Verified Stripe subscription and recurring item evidence are required.");
    }
    if (input.providerEvidence.externalSubscriptionId !== found.proposal.providerSubscriptionId) {
      campaignError("STRIPE_PROVIDER_REFERENCE_MISMATCH", "The reviewed Stripe subscription does not match the locally stored provider reference.");
    }
  }
  const assignmentIds = new Set(found.proposal.proposedItems.map((item) => item.serviceAssignmentId));
  if (input.items.length !== assignmentIds.size || input.items.some((item) => !assignmentIds.has(item.assignmentId))) {
    campaignError("SERVICE_ASSIGNMENT_MISMATCH", "Every proposed service must have exactly one reviewed migration rate.");
  }
  const approvedAt = new Date().toISOString();
  const expectedTotal = money(input.items.reduce((total, item) => total + cents(item.agreedAmountPerCycle), 0));
  if (input.providerEvidence) {
    const providerTotal = money(input.providerEvidence.items.reduce(
      (total, item) => total + cents(item.agreedAmountPerCycle), 0,
    ));
    const providerQuantity = input.providerEvidence.items.reduce((total, item) => total + item.quantity, 0);
    if (providerTotal !== expectedTotal || providerQuantity !== input.items.length) {
      campaignError(
        "STRIPE_PROVIDER_EVIDENCE_MISMATCH",
        "Stripe recurring item amounts and quantities must reconcile exactly to the approved services and cycle total.",
      );
    }
  }
  const decision: ApprovedArrangementDecision = {
    proposalId: found.proposal.proposalId,
    approvedBy: input.ownerEmail,
    approvedAt,
    approvalReason: input.approvalReason.trim(),
    name: `Legacy migration ${found.proposal.sourceKind.replaceAll("_", " ")}`,
    reference: `migration-${found.proposal.sourceKind}-${found.proposal.sourceId}`,
    collectionMethod: found.proposal.collectionMethod ?? "manual_invoice",
    lifecycleStatus: found.proposal.lifecycleStatus === "paused" ? "paused" : "active",
    billingIntervalMonths: found.proposal.billingIntervalMonths as 1 | 3 | 6 | 12,
    currency: found.proposal.currency,
    commercialStartDate: input.commercialStartDate,
    billingAnchorDate: input.billingAnchorDate,
    nextBillingDate: input.nextBillingDate,
    gracePeriodDays: input.gracePeriodDays,
    defaultItemAmountPerCycle: input.items[0]?.agreedAmountPerCycle ?? "0.00",
    expectedTotalAmountPerCycle: expectedTotal,
    items: input.items.map((item) => ({
      itemKey: `assignment-${item.assignmentId}`,
      label: item.label,
      assignmentIds: [item.assignmentId],
      serviceActivatedDate: item.serviceActivatedDate,
      billingEffectiveFrom: input.billingAnchorDate,
      billingEffectiveUntil: null,
      agreedAmountPerCycle: item.agreedAmountPerCycle,
      classification: item.classification,
      changeReason: "Owner-reviewed legacy commercial rate preserved for canonical shadow migration.",
    })),
    sourceInvoiceCoverageConfirmation: input.sourceInvoiceCoverage ?? null,
    providerRelationship: input.providerEvidence ? {
      provider: "stripe",
      externalSubscriptionId: input.providerEvidence.externalSubscriptionId,
      providerStatus: input.providerEvidence.providerStatus,
      activatedAt: input.providerEvidence.activatedAt,
      providerItems: input.providerEvidence.items,
    } : null,
    issueResolutions: input.issueResolutions,
  };
  const plan = createCanonicalMigrationPlan(snapshot, {
    schemaVersion: MIGRATION_APPROVAL_SCHEMA_VERSION,
    sourceFingerprint: migrationSourceFingerprint(snapshot),
    decisions: [decision],
  });
  const entry = plan.entries[0]!;
  return prisma.canonicalMigrationCampaign.create({
    data: {
      title: input.title.trim(),
      sourceAnalysisDate: snapshot.analysisDate,
      sourceFingerprint: migrationSourceFingerprint(snapshot),
      planFingerprint: plan.planFingerprint,
      ownerConfirmations: jsonValue(input.confirmations),
      approvalReason: input.approvalReason.trim(),
      createdById: input.ownerUserId,
      approvedById: input.ownerUserId,
      approvedAt: new Date(approvedAt),
      entries: {
        create: {
          proposalId: entry.proposalId,
          migrationKey: entry.migrationKey,
          customerId: entry.customerId,
          sourceKind: entry.sourceKind,
          sourceId: entry.sourceId,
          sourceFingerprint: entry.sourceFingerprint,
          planFingerprint: plan.planFingerprint,
          approvedPlan: jsonValue(plan),
        },
      },
    },
    include: { entries: true },
  });
}

function parsePlan(value: unknown): CanonicalMigrationPlan {
  if (!value || typeof value !== "object") campaignError("APPROVED_PLAN_INVALID", "The stored campaign plan is invalid.");
  return value as CanonicalMigrationPlan;
}

function errorDetails(error: unknown): { code: string; message: string; status: CampaignEntryStatus } {
  if (error instanceof CanonicalMigrationExecutionError) {
    const status = ["SOURCE_CHANGED_AFTER_APPROVAL", "MIGRATION_APPROVAL_CONFLICT", "ASSIGNMENT_ALREADY_CANONICAL"].includes(error.code)
      ? "blocked"
      : "failed";
    return { code: error.code, message: error.message, status };
  }
  return { code: "MIGRATION_TRANSACTION_FAILED", message: error instanceof Error ? error.message : String(error), status: "failed" };
}

async function refreshCampaignStatus(campaignId: string): Promise<void> {
  const entries = await prisma.canonicalMigrationCampaignEntry.findMany({
    where: { campaignId },
    select: { status: true },
  });
  const statuses = new Set(entries.map((entry) => entry.status));
  const status = statuses.has("blocked")
    ? "needs_review"
    : statuses.has("failed") || statuses.has("skipped")
      ? "completed_with_exceptions"
      : statuses.size === 1 && statuses.has("migrated")
        ? "completed"
        : "executing";
  await prisma.canonicalMigrationCampaign.update({
    where: { id: campaignId },
    data: {
      status,
      executionStartedAt: status === "executing" ? new Date() : undefined,
      completedAt: ["completed", "completed_with_exceptions", "needs_review"].includes(status) ? new Date() : null,
    },
  });
}

export async function executeOwnerApprovedMigrationCampaign(input: {
  campaignId: string;
  ownerUserId: string;
  ownerEmail: string;
  environment?: CanonicalMigrationCampaignEnvironment;
}): Promise<{ migrated: number; blocked: number; failed: number; skipped: number }> {
  const environment = input.environment ?? process.env;
  if (environment.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED !== "true") {
    campaignError("CAMPAIGN_EXECUTION_DISABLED", "Migration execution remains disabled until the owner enables the exact campaign switch.");
  }
  const campaign = await prisma.canonicalMigrationCampaign.findUnique({
    where: { id: input.campaignId },
    include: { entries: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!campaign) campaignError("CAMPAIGN_NOT_FOUND", "The migration campaign was not found.");
  if (campaign.approvedById !== input.ownerUserId) {
    campaignError("OWNER_APPROVAL_REQUIRED", "Only the owner who approved this exact campaign may execute it.");
  }
  const totals = { migrated: 0, blocked: 0, failed: 0, skipped: 0 };
  for (const entry of campaign.entries) {
    if (entry.status === "migrated") {
      totals.skipped += 1;
      continue;
    }
    const claimed = await prisma.canonicalMigrationCampaignEntry.updateMany({
      where: { id: entry.id, status: { in: ["approved", "failed"] } },
      data: { status: "executing", startedAt: new Date(), failureCode: null, failureMessage: null },
    });
    if (claimed.count !== 1) {
      totals.skipped += 1;
      continue;
    }
    try {
      const plan = parsePlan(entry.approvedPlan);
      if (plan.entries.length !== 1 || plan.entries[0]?.migrationKey !== entry.migrationKey || plan.planFingerprint !== entry.planFingerprint) {
        campaignError("APPROVED_PLAN_INVALID", "The immutable entry plan does not match the campaign record.");
      }
      const result = await executeCanonicalMigrationPlan(plan, {
        execute: true,
        confirmation: APPLY_MIGRATION_CONFIRMATION,
        campaignAuthorization: { campaignEntryId: entry.id, approvedBy: input.ownerEmail },
      });
      const execution = result.entries[0]!;
      await prisma.canonicalMigrationCampaignEntry.update({
        where: { id: entry.id },
        data: {
          status: "migrated",
          migrationLedgerId: execution.ledgerId,
          targetSubscriptionId: execution.targetSubscriptionId,
          completedAt: new Date(),
        },
      });
      totals.migrated += 1;
    } catch (error) {
      const details = errorDetails(error);
      await prisma.canonicalMigrationCampaignEntry.update({
        where: { id: entry.id },
        data: { status: details.status, failureCode: details.code, failureMessage: details.message.slice(0, 10_000) },
      });
      if (details.status === "blocked") totals.blocked += 1;
      else totals.failed += 1;
    }
  }
  await refreshCampaignStatus(campaign.id);
  return totals;
}

export async function getCanonicalMigrationCampaignDetail(campaignId: string) {
  return prisma.canonicalMigrationCampaign.findUnique({
    where: { id: campaignId },
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
      entries: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { customer: { select: { id: true, company: true, firstName: true, lastName: true } } },
      },
    },
  });
}
