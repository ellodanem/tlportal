import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  createCanonicalMigrationPlan,
  MIGRATION_APPROVAL_SCHEMA_VERSION,
  migrationSourceFingerprint,
  type ApprovedArrangementDecision,
  type CanonicalMigrationPlan,
} from "@/lib/domain/canonical-subscription-migration";
import {
  analyzeSubscriptionMigration,
  type LegacyBillingSnapshot,
  type SubscriptionMigrationProposal,
} from "@/lib/domain/subscription-migration-analysis";
import { loadLegacyBillingSnapshot } from "@/lib/services/subscription-migration-analysis-service";

export type CanonicalManualPilotCandidate = {
  proposalId: string;
  sourceKind: "manual_schedule" | "manual_invoice";
  sourceScheduleId: string | null;
  sourceInvoiceId: string | null;
  customerId: string;
  customerLabel: string;
  reviewStatus: string;
  billingIntervalMonths: number;
  currency: string;
  recurringAmount: string | null;
  nextBillingDate: string | null;
  proposedItemCount: number;
  issueCodes: string[];
  migrationStatus: string | null;
  targetSubscriptionId: string | null;
};

export type CanonicalManualPilotMigrationReview = {
  candidate: CanonicalManualPilotCandidate;
  proposal: SubscriptionMigrationProposal;
  assignments: Array<{
    id: string;
    startDate: string | null;
    nextDueDate: string | null;
    status: string;
    deviceLabel: string;
    simLabel: string | null;
    suggestedAmount: string | null;
    suggestedClassification: "standard" | "negotiated" | "requires_confirmation";
  }>;
  invoices: Array<{
    id: string;
    number: string | null;
    status: string;
    total: string;
    amountPaid: string;
    amountDue: string;
    issueDate: string;
  }>;
  payments: Array<{
    id: string;
    invoiceId: string;
    amount: string;
    method: string;
    voided: boolean;
  }>;
  outstandingBalance: string;
  sourceFingerprint: string;
  sourceInvoice: {
    id: string;
    issueDate: string;
    subtotal: string;
    taxLabel: string | null;
    taxRatePercent: string | null;
    taxTotal: string;
    total: string;
  } | null;
};

export type ManualPilotApprovedItemInput = {
  assignmentId: string;
  label: string;
  agreedAmountPerCycle: string;
  classification: "standard" | "negotiated";
};

export type BuildManualPilotPlanInput = {
  proposalId: string;
  approvedBy: string;
  approvedAt: string;
  approvalReason: string;
  name: string;
  reference: string;
  commercialStartDate: string;
  billingAnchorDate: string;
  nextBillingDate: string;
  gracePeriodDays: number;
  items: ManualPilotApprovedItemInput[];
};

function displayName(customer: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Unnamed customer";
}

function proposalFromSnapshot(snapshot: LegacyBillingSnapshot, proposalId: string) {
  const analysis = analyzeSubscriptionMigration(snapshot);
  for (const customer of analysis.customers) {
    const proposal = customer.proposals.find((entry) => entry.proposalId === proposalId);
    if (proposal) return { analysis, customer, proposal };
  }
  throw new Error("The selected legacy billing arrangement is no longer available for review.");
}

export async function listCanonicalManualPilotCandidates(
  analysisDate = new Date().toISOString().slice(0, 10),
): Promise<CanonicalManualPilotCandidate[]> {
  const snapshot = await loadLegacyBillingSnapshot(analysisDate);
  const analysis = analyzeSubscriptionMigration(snapshot);
  const proposals = analysis.customers.flatMap((customer) =>
    customer.proposals
      .filter((proposal) =>
        (proposal.sourceKind === "manual_schedule" || proposal.sourceKind === "manual_invoice")
        && proposal.collectionMethod === "manual_invoice")
      .map((proposal) => ({ customer, proposal })));
  const [customers, ledgers] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { in: proposals.map(({ proposal }) => proposal.customerId) } },
      select: { id: true, company: true, firstName: true, lastName: true },
    }),
    prisma.canonicalMigrationLedger.findMany({
      where: {
        sourceKind: { in: ["manual_schedule", "manual_invoice"] },
        sourceId: { in: proposals.map(({ proposal }) => proposal.sourceId) },
      },
      select: { sourceId: true, status: true, targetSubscriptionId: true },
    }),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const ledgerBySource = new Map(ledgers.map((ledger) => [ledger.sourceId, ledger]));
  return proposals.map(({ customer, proposal }) => {
    const ledger = ledgerBySource.get(proposal.sourceId);
    const record = customerById.get(proposal.customerId);
    return {
      proposalId: proposal.proposalId,
      sourceKind: proposal.sourceKind as "manual_schedule" | "manual_invoice",
      sourceScheduleId: proposal.sourceKind === "manual_schedule" ? proposal.sourceId : null,
      sourceInvoiceId: proposal.sourceKind === "manual_invoice" ? proposal.sourceId : null,
      customerId: proposal.customerId,
      customerLabel: record ? displayName(record) : proposal.customerId,
      reviewStatus: customer.reviewStatus === "conflict" ? "conflict" : proposal.reviewStatus,
      billingIntervalMonths: proposal.billingIntervalMonths,
      currency: proposal.currency,
      recurringAmount: proposal.proposedCycleAmount,
      nextBillingDate: proposal.nextBillingDate,
      proposedItemCount: proposal.proposedItems.length,
      issueCodes: [...new Set([...customer.issues, ...proposal.issues].map((issue) => issue.code))].sort(),
      migrationStatus: ledger?.status ?? null,
      targetSubscriptionId: ledger?.targetSubscriptionId ?? null,
    };
  }).sort((left, right) =>
    `${left.nextBillingDate ?? "9999"}:${left.customerLabel}`.localeCompare(
      `${right.nextBillingDate ?? "9999"}:${right.customerLabel}`,
    ));
}

export async function getCanonicalManualPilotMigrationReview(
  proposalId: string,
  analysisDate = new Date().toISOString().slice(0, 10),
): Promise<CanonicalManualPilotMigrationReview> {
  const snapshot = await loadLegacyBillingSnapshot(analysisDate);
  const { customer, proposal } = proposalFromSnapshot(snapshot, proposalId);
  if (
    (proposal.sourceKind !== "manual_schedule" && proposal.sourceKind !== "manual_invoice")
    || proposal.collectionMethod !== "manual_invoice"
  ) {
    throw new Error("The first operational pilot is restricted to a verified manual billing arrangement.");
  }
  const customerRecord = await prisma.customer.findUniqueOrThrow({
    where: { id: proposal.customerId },
    select: { company: true, firstName: true, lastName: true },
  });
  const proposedByAssignment = new Map(proposal.proposedItems.map((item) => [item.serviceAssignmentId, item]));
  const candidateAssignmentIds = new Set([
    ...proposal.proposedItems.map((item) => item.serviceAssignmentId),
    ...customer.unmappedAssignmentIds,
  ]);
  const assignments = await prisma.serviceAssignment.findMany({
    where: {
      id: { in: [...candidateAssignmentIds] },
      customerId: proposal.customerId,
      subscriptionItemId: null,
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    include: {
      device: { select: { label: true, deviceModel: { select: { name: true } } } },
      simCard: { select: { label: true, iccid: true } },
    },
  });
  const invoices = snapshot.invoices.filter((invoice) => proposal.invoiceIds.includes(invoice.id));
  const payments = snapshot.payments.filter((payment) => proposal.paymentIds.includes(payment.id));
  const sourceInvoice = proposal.sourceKind === "manual_invoice"
    ? await prisma.invoice.findUnique({
      where: { id: proposal.sourceId },
      select: {
        id: true,
        customerId: true,
        customerSubscriptionId: true,
        recurringScheduleId: true,
        archivedAt: true,
        status: true,
        issueDate: true,
        subtotal: true,
        taxLabel: true,
        taxRatePercent: true,
        taxTotal: true,
        total: true,
        lineItems: { select: { quantity: true, unitPrice: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    })
    : null;
  if (proposal.sourceKind === "manual_invoice" && (
    !sourceInvoice
    || sourceInvoice.customerId !== proposal.customerId
    || sourceInvoice.customerSubscriptionId != null
    || sourceInvoice.recurringScheduleId != null
    || sourceInvoice.archivedAt != null
    || ["void", "written_off"].includes(sourceInvoice.status)
  )) {
    throw new Error("The selected manual invoice is no longer a valid independent billing source.");
  }
  const ledger = await prisma.canonicalMigrationLedger.findUnique({
    where: { sourceKind_sourceId: { sourceKind: proposal.sourceKind, sourceId: proposal.sourceId } },
    select: { status: true, targetSubscriptionId: true },
  });
  return {
    candidate: {
      proposalId,
      sourceKind: proposal.sourceKind,
      sourceScheduleId: proposal.sourceKind === "manual_schedule" ? proposal.sourceId : null,
      sourceInvoiceId: proposal.sourceKind === "manual_invoice" ? proposal.sourceId : null,
      customerId: proposal.customerId,
      customerLabel: displayName(customerRecord),
      reviewStatus: customer.reviewStatus === "conflict" ? "conflict" : proposal.reviewStatus,
      billingIntervalMonths: proposal.billingIntervalMonths,
      currency: proposal.currency,
      recurringAmount: proposal.proposedCycleAmount,
      nextBillingDate: proposal.nextBillingDate,
      proposedItemCount: proposal.proposedItems.length,
      issueCodes: [...new Set([...customer.issues, ...proposal.issues].map((issue) => issue.code))].sort(),
      migrationStatus: ledger?.status ?? null,
      targetSubscriptionId: ledger?.targetSubscriptionId ?? null,
    },
    proposal,
    assignments: assignments.map((assignment) => {
      const suggested = proposedByAssignment.get(assignment.id);
      return {
        id: assignment.id,
        startDate: assignment.startDate?.toISOString().slice(0, 10) ?? null,
        nextDueDate: assignment.nextDueDate?.toISOString().slice(0, 10) ?? null,
        status: assignment.status,
        deviceLabel: assignment.device.label?.trim() || assignment.device.deviceModel.name,
        simLabel: assignment.simCard
          ? `${assignment.simCard.label?.trim() || "SIM"} ••••${assignment.simCard.iccid.slice(-4)}`
          : null,
        suggestedAmount: suggested?.proposedCycleAmount ?? null,
        suggestedClassification: suggested?.rateClassification ?? "requires_confirmation",
      };
    }),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: null,
      status: invoice.status,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      issueDate: invoice.issueDate,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      method: payment.method,
      voided: payment.voidedAt != null,
    })),
    outstandingBalance: customer.outstandingNativeBalance,
    sourceFingerprint: migrationSourceFingerprint(snapshot),
    sourceInvoice: sourceInvoice ? {
      id: sourceInvoice.id,
      issueDate: sourceInvoice.issueDate.toISOString(),
      subtotal: sourceInvoice.subtotal.toFixed(2),
      taxLabel: sourceInvoice.taxLabel,
      taxRatePercent: sourceInvoice.taxRatePercent?.toFixed(2) ?? null,
      taxTotal: sourceInvoice.taxTotal.toFixed(2),
      total: sourceInvoice.total.toFixed(2),
    } : null,
  };
}

export async function buildCanonicalManualPilotMigrationPlan(
  input: BuildManualPilotPlanInput,
  analysisDate = new Date().toISOString().slice(0, 10),
): Promise<CanonicalMigrationPlan> {
  const snapshot = await loadLegacyBillingSnapshot(analysisDate);
  const { customer, proposal } = proposalFromSnapshot(snapshot, input.proposalId);
  if (
    (proposal.sourceKind !== "manual_schedule" && proposal.sourceKind !== "manual_invoice")
    || proposal.collectionMethod !== "manual_invoice"
  ) {
    throw new Error("Only a verified manual billing arrangement can be prepared for the first pilot.");
  }
  if (!input.items.length) throw new Error("At least one explicitly priced service is required.");
  const assignments = new Map(snapshot.assignments.map((assignment) => [assignment.id, assignment]));
  const seen = new Set<string>();
  const normalizedItems = input.items.map((item, index) => {
    if (seen.has(item.assignmentId)) throw new Error("Each service assignment may be approved only once.");
    seen.add(item.assignmentId);
    const assignment = assignments.get(item.assignmentId);
    if (!assignment || assignment.customerId !== proposal.customerId || assignment.subscriptionItemId) {
      throw new Error("An approved service assignment is missing, belongs to another customer, or is already canonical.");
    }
    const amount = new Prisma.Decimal(item.agreedAmountPerCycle);
    if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
      throw new Error("Each agreed service price must be a non-negative amount with at most two decimals.");
    }
    return {
      itemKey: `service-${index + 1}-${item.assignmentId}`,
      label: item.label.trim() || `Tracking service ${index + 1}`,
      assignmentIds: [item.assignmentId],
      serviceActivatedDate: assignment.startDate?.slice(0, 10) ?? input.commercialStartDate,
      billingEffectiveFrom: input.nextBillingDate,
      billingEffectiveUntil: null,
      agreedAmountPerCycle: amount.toFixed(2),
      classification: item.classification,
      changeReason: `Phase 4A owner-reviewed legacy terms: ${input.approvalReason.trim()}`,
    };
  });
  const expectedTotal = normalizedItems.reduce(
    (total, item) => total.plus(item.agreedAmountPerCycle),
    new Prisma.Decimal(0),
  ).toFixed(2);
  if (proposal.sourceKind === "manual_invoice") {
    const sourceInvoice = await prisma.invoice.findUnique({
      where: { id: proposal.sourceId },
      select: {
        customerId: true,
        customerSubscriptionId: true,
        recurringScheduleId: true,
        archivedAt: true,
        status: true,
        currency: true,
        subtotal: true,
        taxRatePercent: true,
        taxTotal: true,
        total: true,
        lineItems: { select: { quantity: true, unitPrice: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    });
    if (
      !sourceInvoice
      || sourceInvoice.customerId !== proposal.customerId
      || sourceInvoice.customerSubscriptionId != null
      || sourceInvoice.recurringScheduleId != null
      || sourceInvoice.archivedAt != null
      || ["void", "written_off"].includes(sourceInvoice.status)
    ) {
      throw new Error("The selected manual invoice is no longer a valid independent billing source.");
    }
    if (sourceInvoice.currency.toUpperCase() !== proposal.currency.toUpperCase()) {
      throw new Error("The selected manual invoice currency does not match the approved arrangement.");
    }
    if (!sourceInvoice.subtotal.equals(expectedTotal)) {
      throw new Error("Approved service prices must equal the selected manual invoice subtotal exactly.");
    }
    const sourceQuantity = sourceInvoice.lineItems.reduce((total, line) => {
      const quantity = new Prisma.Decimal(line.quantity);
      return quantity.isInteger() && quantity.greaterThan(0) ? total + quantity.toNumber() : total;
    }, 0);
    const sourceUnitPrices = [...new Set(sourceInvoice.lineItems.map((line) => line.unitPrice.toFixed(2)))];
    if (!sourceQuantity || sourceQuantity !== normalizedItems.length || sourceUnitPrices.length !== 1) {
      throw new Error("The selected manual invoice must provide one unambiguous unit price for every approved service assignment.");
    }
    if (normalizedItems.some((item) => item.agreedAmountPerCycle !== sourceUnitPrices[0])) {
      throw new Error("Each approved service price must match the selected manual invoice unit price exactly.");
    }
    const expectedTax = sourceInvoice.taxRatePercent == null
      ? new Prisma.Decimal(0)
      : sourceInvoice.subtotal.mul(sourceInvoice.taxRatePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (!sourceInvoice.taxTotal.equals(expectedTax) || !sourceInvoice.total.equals(sourceInvoice.subtotal.plus(sourceInvoice.taxTotal))) {
      throw new Error("The selected manual invoice tax treatment is not internally consistent.");
    }
  }
  const requiredIssueCodes = [...new Set([...customer.issues, ...proposal.issues]
    .filter((issue) => issue.severity === "decision" || issue.severity === "conflict")
    .map((issue) => issue.code))].sort();
  const decision: ApprovedArrangementDecision = {
    proposalId: input.proposalId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    approvalReason: input.approvalReason,
    name: input.name,
    reference: input.reference,
    collectionMethod: "manual_invoice",
    lifecycleStatus: "active",
    billingIntervalMonths: proposal.billingIntervalMonths as 1 | 3 | 6 | 12,
    currency: proposal.currency,
    commercialStartDate: input.commercialStartDate,
    billingAnchorDate: input.billingAnchorDate,
    nextBillingDate: input.nextBillingDate,
    gracePeriodDays: input.gracePeriodDays,
    defaultItemAmountPerCycle: normalizedItems[0].agreedAmountPerCycle,
    expectedTotalAmountPerCycle: expectedTotal,
    items: normalizedItems,
    providerRelationship: null,
    issueResolutions: requiredIssueCodes.map((code) => ({
      code,
      explanation: input.approvalReason.trim(),
    })),
  };
  return createCanonicalMigrationPlan(snapshot, {
    schemaVersion: MIGRATION_APPROVAL_SCHEMA_VERSION,
    sourceFingerprint: migrationSourceFingerprint(snapshot),
    decisions: [decision],
  });
}
