import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalManualPilotAuthorization,
  canonicalManualPilotApprovalFingerprint,
  canonicalManualPilotProposalFingerprint,
  CanonicalManualPilotError,
  type CanonicalManualPilotAuthorization,
  type CanonicalManualPilotEnvironment,
  type CanonicalManualPilotProposal,
} from "@/lib/domain/canonical-manual-pilot";
import { migrationFingerprint } from "@/lib/domain/canonical-subscription-migration";
import { resolveCanonicalBillingCycle } from "@/lib/domain/canonical-native-billing";
import {
  assertCanonicalSubscriptionActivationEnabled,
  type CanonicalSubscriptionActivationEnvironment,
} from "@/lib/domain/canonical-subscription-activation";

export const ACTIVATE_MANUAL_PILOT_CONFIRMATION = "ACTIVATE_ONE_MANUAL_CANONICAL_PILOT" as const;

type PilotReader = Pick<
  Prisma.TransactionClient,
  "customerSubscription" | "recurringInvoiceSchedule" | "invoice"
>;

export type CanonicalManualPilotExecutionResult = {
  activationId: string;
  activationKey: string;
  status: "active";
  targetSubscriptionId: string;
  sourceKind: "manual_schedule" | "manual_invoice";
  legacyScheduleId: string | null;
  sourceInvoiceId: string | null;
  canonicalScheduleId: string;
  cutoverPeriodStart: string;
  recurringAmount: string;
  alreadyApplied: boolean;
  reconciliation: {
    oneBillingAuthority: boolean;
    legacyScheduleEnded: boolean;
    canonicalScheduleActive: boolean;
    canonicalSubscriptionActive: boolean;
    invoiceCountChanged: boolean;
    paymentCountChanged: boolean;
  };
};

export type CanonicalManualPilotReview = {
  proposal: CanonicalManualPilotProposal;
  customerLabel: string;
  legacySchedule: {
    id: string;
    name: string | null;
    status: string;
    nextIssueDate: Date;
    intervalMonths: number;
    currency: string;
    lineItems: Array<{
      id: string;
      description: string;
      quantity: string;
      unitPrice: string;
      lineTotal: string;
    }>;
  } | null;
  sourceInvoice: {
    id: string;
    status: string;
    issueDate: Date;
    subtotal: string;
    taxLabel: string | null;
    taxRatePercent: string | null;
    taxTotal: string;
    total: string;
  } | null;
  items: Array<{
    id: string;
    label: string;
    amount: string;
    classification: string;
    assignmentIds: string[];
    equipment: Array<{
      assignmentId: string;
      status: string;
      deviceLabel: string;
      simLabel: string | null;
    }>;
  }>;
  historicalInvoices: Array<{
    id: string;
    number: string | null;
    status: string;
    total: string;
    amountPaid: string;
    amountDue: string;
    issueDate: Date;
    payments: Array<{
      id: string;
      amount: string;
      method: string;
      voided: boolean;
    }>;
  }>;
  activation: {
    id: string;
    status: string;
    canonicalScheduleId: string | null;
    activatedAt: Date | null;
    failureCode: string | null;
    failureMessage: string | null;
  } | null;
  blockers: string[];
};

function pilotError(code: string, message: string): never {
  throw new CanonicalManualPilotError(code, message);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sameUtcDay(left: Date, right: Date): boolean {
  return dateOnly(left) === dateOnly(right);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function customerLabel(customer: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Unnamed customer";
}

async function loadPilotReview(
  subscriptionId: string,
  client: PilotReader,
): Promise<CanonicalManualPilotReview> {
  const subscription = await client.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: { select: { company: true, firstName: true, lastName: true } },
      canonicalMigrationLedger: {
        include: {
          manualPilotActivation: {
            select: {
              id: true,
              status: true,
              canonicalScheduleId: true,
              activatedAt: true,
              failureCode: true,
              failureMessage: true,
            },
          },
        },
      },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] },
          serviceAssignments: {
            orderBy: [{ startDate: "asc" }, { id: "asc" }],
            include: {
              device: { select: { label: true, deviceModel: { select: { name: true } } } },
              simCard: { select: { iccid: true, label: true } },
            },
          },
        },
      },
      recurringSchedules: {
        where: { status: { not: "ended" } },
        select: { id: true, status: true, nextIssueDate: true },
      },
      providerLinks: { where: { endedAt: null }, select: { id: true } },
    },
  });
  if (!subscription) pilotError("PILOT_SUBSCRIPTION_NOT_FOUND", "Canonical subscription was not found.");
  const ledger = subscription.canonicalMigrationLedger;
  if (!ledger) pilotError("PILOT_MIGRATION_REQUIRED", "The subscription does not have a migration ledger.");
  if (ledger.sourceKind !== "manual_schedule" && ledger.sourceKind !== "manual_invoice") {
    pilotError("PILOT_MANUAL_SOURCE_REQUIRED", "The first pilot requires a migrated manual schedule or verified manual invoice.");
  }
  const sourceKind = ledger.sourceKind as "manual_schedule" | "manual_invoice";
  const legacySchedule = sourceKind === "manual_schedule"
    ? await client.recurringInvoiceSchedule.findUnique({
      where: { id: ledger.sourceId },
      include: { lineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    })
    : null;
  if (sourceKind === "manual_schedule" && !legacySchedule) {
    pilotError("PILOT_LEGACY_SCHEDULE_NOT_FOUND", "The approved legacy schedule no longer exists.");
  }
  const sourceInvoice = sourceKind === "manual_invoice"
    ? await client.invoice.findUnique({
      where: { id: ledger.sourceId },
      include: { lineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, payments: { orderBy: [{ receivedAt: "asc" }, { id: "asc" }] } },
    })
    : null;
  if (sourceKind === "manual_invoice" && !sourceInvoice) {
    pilotError("PILOT_SOURCE_INVOICE_NOT_FOUND", "The approved source invoice no longer exists.");
  }

  const historicalInvoices = await client.invoice.findMany({
    where: sourceKind === "manual_schedule"
      ? { recurringScheduleId: legacySchedule!.id }
      : { id: sourceInvoice!.id },
    orderBy: [{ issueDate: "asc" }, { id: "asc" }],
    include: {
      payments: { orderBy: [{ receivedAt: "asc" }, { id: "asc" }] },
    },
  });

  const cutoverPeriodStart = subscription.nextBillingDate ?? legacySchedule?.nextIssueDate;
  if (!cutoverPeriodStart) pilotError("PILOT_CUTOVER_DATE_MISSING", "The canonical next billing date is required.");
  const blockers: string[] = [];
  if (ledger.status !== "completed") blockers.push("The shadow migration has not completed successfully.");
  if (subscription.collectionMethod !== "manual_invoice") blockers.push("The first pilot is restricted to manual invoicing.");
  if (subscription.lifecycleStatus !== "active") blockers.push("The canonical commercial subscription must be active.");
  if (subscription.controlMode !== "shadow" && subscription.controlMode !== "canonical") {
    blockers.push("The migrated subscription must remain in shadow mode until cutover.");
  }
  if (legacySchedule && legacySchedule.customerId !== subscription.customerId) blockers.push("Legacy schedule customer ownership differs.");
  if (sourceInvoice && (
    sourceInvoice.customerId !== subscription.customerId
    || sourceInvoice.customerSubscriptionId != null
    || sourceInvoice.recurringScheduleId != null
    || sourceInvoice.archivedAt != null
    || ["void", "written_off"].includes(sourceInvoice.status)
  )) blockers.push("The source invoice is no longer a valid independent manual billing record.");
  if (legacySchedule && legacySchedule.status !== "active" && !ledger.manualPilotActivation?.activatedAt) {
    blockers.push("The legacy recurring schedule is not active.");
  }
  if (
    subscription.billingIntervalMonths == null
    || subscription.currency == null
    || subscription.nextBillingDate == null
  ) {
    blockers.push("Canonical billing interval, currency, and next billing date must be complete.");
  }
  if (
    subscription.nextBillingDate
    && legacySchedule != null
    && !sameUtcDay(subscription.nextBillingDate, legacySchedule.nextIssueDate)
    && !ledger.manualPilotActivation?.activatedAt
  ) {
    blockers.push("Legacy and canonical renewal dates do not match.");
  }
  if (
    subscription.billingIntervalMonths != null
    && legacySchedule != null
    && subscription.billingIntervalMonths !== legacySchedule.intervalMonths
  ) {
    blockers.push("Legacy and canonical billing intervals do not match.");
  }
  if (legacySchedule && subscription.currency && subscription.currency.toUpperCase() !== legacySchedule.currency.toUpperCase()) {
    blockers.push("Legacy and canonical currencies do not match.");
  }
  if (sourceInvoice && subscription.currency && subscription.currency.toUpperCase() !== sourceInvoice.currency.toUpperCase()) {
    blockers.push("The source invoice currency does not match canonical billing.");
  }
  if (subscription.providerLinks.length) blockers.push("Manual pilot subscriptions cannot have an open provider relationship.");
  if (subscription.recurringSchedules.length && !ledger.manualPilotActivation?.canonicalScheduleId) {
    blockers.push("A canonical recurring schedule is already open for this subscription.");
  }

  let cycle: ReturnType<typeof resolveCanonicalBillingCycle> | null = null;
  try {
    cycle = resolveCanonicalBillingCycle({
      lifecycleStatus: subscription.lifecycleStatus,
      billingIntervalMonths: subscription.billingIntervalMonths,
      currency: subscription.currency,
      items: subscription.items,
    }, cutoverPeriodStart);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "Canonical pricing could not be resolved.");
  }

  const outstandingInvoices = historicalInvoices.filter((invoice) =>
    invoice.archivedAt == null && invoice.amountDue.greaterThan(0));
  const outstandingBalance = outstandingInvoices.reduce(
    (total, invoice) => total.plus(invoice.amountDue),
    new Prisma.Decimal(0),
  ).toFixed(2);
  const assignmentIds = subscription.items.flatMap((item) =>
    item.serviceAssignments.map((assignment) => assignment.id)).sort();
  const sourceStateFingerprint = migrationFingerprint({
    ledger: {
      id: ledger.id,
      migrationKey: ledger.migrationKey,
      status: ledger.status,
      sourceFingerprint: ledger.sourceFingerprint,
      planFingerprint: ledger.planFingerprint,
      targetSubscriptionId: ledger.targetSubscriptionId,
    },
    subscription: {
      id: subscription.id,
      customerId: subscription.customerId,
      collectionMethod: subscription.collectionMethod,
      lifecycleStatus: subscription.lifecycleStatus,
      controlMode: subscription.controlMode,
      billingIntervalMonths: subscription.billingIntervalMonths,
      currency: subscription.currency,
      billingAnchorDate: subscription.billingAnchorDate,
      nextBillingDate: subscription.nextBillingDate,
      gracePeriodDays: subscription.gracePeriodDays,
      items: subscription.items.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        billingEffectiveFrom: item.billingEffectiveFrom,
        billingEffectiveUntil: item.billingEffectiveUntil,
        assignmentIds: item.serviceAssignments.map((assignment) => assignment.id).sort(),
        rates: item.rates.map((rate) => ({
          id: rate.id,
          billingIntervalMonths: rate.billingIntervalMonths,
          agreedAmountPerCycle: rate.agreedAmountPerCycle.toFixed(2),
          currency: rate.currency,
          effectiveFrom: rate.effectiveFrom,
          effectiveUntil: rate.effectiveUntil,
          classification: rate.classification,
        })),
      })),
    },
    legacySchedule: legacySchedule ? {
      id: legacySchedule.id,
      status: legacySchedule.status,
      customerId: legacySchedule.customerId,
      intervalMonths: legacySchedule.intervalMonths,
      currency: legacySchedule.currency,
      nextIssueDate: legacySchedule.nextIssueDate,
      dueDaysAfterIssue: legacySchedule.dueDaysAfterIssue,
      autoEmail: legacySchedule.autoEmail,
      billToName: legacySchedule.billToName,
      billToLines: legacySchedule.billToLines,
      taxLabel: legacySchedule.taxLabel,
      taxRatePercent: legacySchedule.taxRatePercent?.toFixed(2) ?? null,
      notes: legacySchedule.notes,
      paymentInstructions: legacySchedule.paymentInstructions,
      emailTo: legacySchedule.emailTo,
      lineItems: legacySchedule.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
    } : null,
    sourceInvoice: sourceInvoice ? {
      id: sourceInvoice.id,
      status: sourceInvoice.status,
      customerId: sourceInvoice.customerId,
      customerSubscriptionId: sourceInvoice.customerSubscriptionId,
      recurringScheduleId: sourceInvoice.recurringScheduleId,
      currency: sourceInvoice.currency,
      issueDate: sourceInvoice.issueDate,
      dueDate: sourceInvoice.dueDate,
      subtotal: sourceInvoice.subtotal.toFixed(2),
      taxLabel: sourceInvoice.taxLabel,
      taxRatePercent: sourceInvoice.taxRatePercent?.toFixed(2) ?? null,
      taxTotal: sourceInvoice.taxTotal.toFixed(2),
      total: sourceInvoice.total.toFixed(2),
      amountPaid: sourceInvoice.amountPaid.toFixed(2),
      amountDue: sourceInvoice.amountDue.toFixed(2),
      billToName: sourceInvoice.billToName,
      billToLines: sourceInvoice.billToLines,
      notes: sourceInvoice.notes,
      paymentInstructions: sourceInvoice.paymentInstructions,
      lineItems: sourceInvoice.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
    } : null,
    historicalInvoices: historicalInvoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      total: invoice.total.toFixed(2),
      amountPaid: invoice.amountPaid.toFixed(2),
      amountDue: invoice.amountDue.toFixed(2),
      issueDate: invoice.issueDate,
      archivedAt: invoice.archivedAt,
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        method: payment.method,
        voidedAt: payment.voidedAt,
      })),
    })),
  });

  const recurringAmount = cycle?.subtotal.toFixed(2) ?? "0.00";
  const proposal: CanonicalManualPilotProposal = {
    activationKey: `manual-pilot:${sourceKind}:${ledger.migrationKey}:${dateOnly(cutoverPeriodStart)}`,
    migrationLedgerId: ledger.id,
    migrationKey: ledger.migrationKey,
    customerId: subscription.customerId,
    subscriptionId: subscription.id,
    sourceKind,
    legacyScheduleId: legacySchedule?.id ?? null,
    sourceInvoiceId: sourceInvoice?.id ?? null,
    migrationSourceFingerprint: ledger.sourceFingerprint,
    migrationPlanFingerprint: ledger.planFingerprint,
    sourceStateFingerprint,
    cutoverPeriodStart: dateOnly(cutoverPeriodStart),
    billingIntervalMonths: subscription.billingIntervalMonths as 1 | 3 | 4 | 6 | 12,
    currency: (subscription.currency ?? legacySchedule?.currency ?? sourceInvoice?.currency ?? "XCD").toUpperCase(),
    recurringAmount,
    itemCount: cycle?.lines.length ?? 0,
    assignmentIds,
    outstandingBalance,
    outstandingInvoiceIds: outstandingInvoices.map((invoice) => invoice.id).sort(),
  };

  return {
    proposal,
    customerLabel: customerLabel(subscription.customer),
    legacySchedule: legacySchedule ? {
      id: legacySchedule.id,
      name: legacySchedule.name,
      status: legacySchedule.status,
      nextIssueDate: legacySchedule.nextIssueDate,
      intervalMonths: legacySchedule.intervalMonths,
      currency: legacySchedule.currency,
      lineItems: legacySchedule.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
    } : null,
    sourceInvoice: sourceInvoice ? {
      id: sourceInvoice.id,
      status: sourceInvoice.status,
      issueDate: sourceInvoice.issueDate,
      subtotal: sourceInvoice.subtotal.toFixed(2),
      taxLabel: sourceInvoice.taxLabel,
      taxRatePercent: sourceInvoice.taxRatePercent?.toFixed(2) ?? null,
      taxTotal: sourceInvoice.taxTotal.toFixed(2),
      total: sourceInvoice.total.toFixed(2),
    } : null,
    items: subscription.items.map((item) => {
      const line = cycle?.lines.find((candidate) => candidate.subscriptionItemId === item.id);
      return {
        id: item.id,
        label: item.label?.trim() || "Tracking service",
        amount: line?.billedAmount.toFixed(2) ?? "0.00",
        classification: line?.classification ?? "unresolved",
        assignmentIds: item.serviceAssignments.map((assignment) => assignment.id).sort(),
        equipment: item.serviceAssignments.map((assignment) => ({
          assignmentId: assignment.id,
          status: assignment.status,
          deviceLabel: assignment.device.label?.trim() || assignment.device.deviceModel.name,
          simLabel: assignment.simCard
            ? `${assignment.simCard.label?.trim() || "SIM"} ••••${assignment.simCard.iccid.slice(-4)}`
            : null,
        })),
      };
    }),
    historicalInvoices: historicalInvoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      total: invoice.total.toFixed(2),
      amountPaid: invoice.amountPaid.toFixed(2),
      amountDue: invoice.amountDue.toFixed(2),
      issueDate: invoice.issueDate,
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        method: payment.method,
        voided: payment.voidedAt != null,
      })),
    })),
    activation: ledger.manualPilotActivation,
    blockers,
  };
}

export async function getCanonicalManualPilotReview(
  subscriptionId: string,
): Promise<CanonicalManualPilotReview> {
  return loadPilotReview(subscriptionId, prisma);
}

async function registerApproval(input: {
  proposal: CanonicalManualPilotProposal;
  authorization: CanonicalManualPilotAuthorization;
}) {
  const approvalFingerprint = canonicalManualPilotApprovalFingerprint(input.authorization);
  try {
    return await prisma.canonicalManualPilotActivation.create({
      data: {
        activationKey: input.proposal.activationKey,
        authorizationId: input.authorization.authorizationId,
        migrationLedgerId: input.proposal.migrationLedgerId,
        customerId: input.proposal.customerId,
        targetSubscriptionId: input.proposal.subscriptionId,
        sourceKind: input.proposal.sourceKind,
        legacyScheduleId: input.proposal.legacyScheduleId,
        sourceInvoiceId: input.proposal.sourceInvoiceId,
        sourceStateFingerprint: input.proposal.sourceStateFingerprint,
        proposalFingerprint: canonicalManualPilotProposalFingerprint(input.proposal),
        approvalFingerprint,
        cutoverPeriodStart: new Date(`${input.proposal.cutoverPeriodStart}T00:00:00.000Z`),
        recurringAmount: input.proposal.recurringAmount,
        currency: input.proposal.currency,
        billingIntervalMonths: input.proposal.billingIntervalMonths,
        approvedBy: input.authorization.approvedByEmail.trim().toLowerCase(),
        approvalReason: input.authorization.approvalReason.trim(),
        approvedAt: new Date(input.authorization.issuedAt),
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.canonicalManualPilotActivation.findFirst({
      where: {
        OR: [
          { activationKey: input.proposal.activationKey },
          { authorizationId: input.authorization.authorizationId },
          { migrationLedgerId: input.proposal.migrationLedgerId },
          { targetSubscriptionId: input.proposal.subscriptionId },
          ...(input.proposal.legacyScheduleId ? [{ legacyScheduleId: input.proposal.legacyScheduleId }] : []),
          ...(input.proposal.sourceInvoiceId ? [{ sourceInvoiceId: input.proposal.sourceInvoiceId }] : []),
        ],
      },
    });
    if (
      !existing
      || existing.activationKey !== input.proposal.activationKey
      || existing.authorizationId !== input.authorization.authorizationId
      || existing.approvalFingerprint !== approvalFingerprint
      || existing.proposalFingerprint !== canonicalManualPilotProposalFingerprint(input.proposal)
    ) {
      pilotError("PILOT_APPROVAL_REPLAY_CONFLICT", "Pilot approval was already used for a different activation.");
    }
    return existing;
  }
}

async function executeActivationTransaction(input: {
  activationId: string;
  proposal: CanonicalManualPilotProposal;
}): Promise<CanonicalManualPilotExecutionResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "CanonicalManualPilotActivation"
      WHERE "id" = ${input.activationId}
      FOR UPDATE
    `);
    const activation = await tx.canonicalManualPilotActivation.findUniqueOrThrow({
      where: { id: input.activationId },
    });
    if (activation.status === "active" && activation.canonicalScheduleId) {
      return {
        activationId: activation.id,
        activationKey: activation.activationKey,
        status: "active" as const,
        targetSubscriptionId: activation.targetSubscriptionId,
        sourceKind: activation.sourceKind as "manual_schedule" | "manual_invoice",
        legacyScheduleId: activation.legacyScheduleId,
        sourceInvoiceId: activation.sourceInvoiceId,
        canonicalScheduleId: activation.canonicalScheduleId,
        cutoverPeriodStart: dateOnly(activation.cutoverPeriodStart),
        recurringAmount: activation.recurringAmount.toFixed(2),
        alreadyApplied: true,
        reconciliation: activation.reconciliation as CanonicalManualPilotExecutionResult["reconciliation"],
      };
    }
    if (["reversed", "needs_review"].includes(activation.status)) {
      pilotError("PILOT_ACTIVATION_BLOCKED", "This pilot activation requires owner review before another attempt.");
    }

    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "CanonicalMigrationLedger"
      WHERE "id" = ${input.proposal.migrationLedgerId}
      FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "CustomerSubscription"
      WHERE "id" = ${input.proposal.subscriptionId}
      FOR UPDATE
    `);
    if (input.proposal.legacyScheduleId) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "RecurringInvoiceSchedule"
        WHERE "id" = ${input.proposal.legacyScheduleId}
        FOR UPDATE
      `);
    }
    if (input.proposal.sourceInvoiceId) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Invoice"
        WHERE "id" = ${input.proposal.sourceInvoiceId}
        FOR UPDATE
      `);
    }

    const current = await loadPilotReview(input.proposal.subscriptionId, tx);
    if (current.blockers.length) {
      pilotError("PILOT_REVIEW_BLOCKED", current.blockers.join(" "));
    }
    if (
      current.proposal.sourceStateFingerprint !== input.proposal.sourceStateFingerprint
      || canonicalManualPilotProposalFingerprint(current.proposal) !== activation.proposalFingerprint
    ) {
      pilotError("PILOT_SOURCE_CHANGED", "Pilot source records changed after owner approval.");
    }

    const cutoverStart = new Date(`${input.proposal.cutoverPeriodStart}T00:00:00.000Z`);
    const cutoverEnd = new Date(cutoverStart);
    cutoverEnd.setUTCDate(cutoverEnd.getUTCDate() + 1);
    const periodLookback = new Date(cutoverStart);
    periodLookback.setUTCMonth(periodLookback.getUTCMonth() - input.proposal.billingIntervalMonths);
    const alreadyBilled = await tx.invoice.findFirst({
      where: input.proposal.sourceKind === "manual_schedule" ? {
        recurringScheduleId: input.proposal.legacyScheduleId!,
        issueDate: { gte: cutoverStart, lt: cutoverEnd },
      } : {
        customerId: input.proposal.customerId,
        recurringScheduleId: null,
        archivedAt: null,
        status: { notIn: ["void", "written_off"] },
        issueDate: { gte: periodLookback, lte: cutoverStart },
        id: { not: input.proposal.sourceInvoiceId! },
      },
      select: { id: true },
    });
    if (alreadyBilled) {
      pilotError("PILOT_CUTOVER_PERIOD_ALREADY_BILLED", "An existing legacy or manual invoice already conflicts with the approved cutover period.");
    }

    const before = {
      invoices: await tx.invoice.count({ where: { customerId: input.proposal.customerId } }),
      payments: await tx.payment.count({ where: { customerId: input.proposal.customerId } }),
    };
    await tx.canonicalManualPilotActivation.update({
      where: { id: activation.id },
      data: {
        status: "in_progress",
        startedAt: new Date(),
        failedAt: null,
        failureCode: null,
        failureMessage: null,
      },
    });
    const legacySchedule = input.proposal.legacyScheduleId
      ? await tx.recurringInvoiceSchedule.update({
        where: { id: input.proposal.legacyScheduleId },
        data: { status: "ended" },
      })
      : null;
    const sourceInvoice = input.proposal.sourceInvoiceId
      ? await tx.invoice.findUniqueOrThrow({ where: { id: input.proposal.sourceInvoiceId } })
      : null;
    const canonicalSchedule = await tx.recurringInvoiceSchedule.create({
      data: {
        status: "active",
        name: `${legacySchedule?.name?.trim() || sourceInvoice?.billToName?.trim() || "Tracking services"} - canonical`,
        customerId: input.proposal.customerId,
        customerSubscriptionId: input.proposal.subscriptionId,
        billToName: legacySchedule?.billToName ?? sourceInvoice?.billToName ?? null,
        billToLines: legacySchedule?.billToLines ?? sourceInvoice?.billToLines ?? [],
        currency: input.proposal.currency,
        taxLabel: legacySchedule?.taxLabel ?? sourceInvoice?.taxLabel ?? null,
        taxRatePercent: legacySchedule?.taxRatePercent ?? sourceInvoice?.taxRatePercent ?? null,
        notes: legacySchedule?.notes ?? sourceInvoice?.notes ?? null,
        paymentInstructions: legacySchedule?.paymentInstructions ?? sourceInvoice?.paymentInstructions ?? null,
        intervalMonths: input.proposal.billingIntervalMonths,
        nextIssueDate: cutoverStart,
        dueDaysAfterIssue: legacySchedule?.dueDaysAfterIssue ?? 30,
        autoEmail: legacySchedule?.autoEmail ?? false,
        emailTo: legacySchedule?.emailTo ?? null,
        createdById: legacySchedule?.createdById ?? sourceInvoice?.createdById ?? null,
      },
    });
    await tx.customerSubscription.update({
      where: { id: input.proposal.subscriptionId },
      data: {
        controlMode: "canonical",
        collectionHealth: "not_started",
      },
    });

    const after = {
      invoices: await tx.invoice.count({ where: { customerId: input.proposal.customerId } }),
      payments: await tx.payment.count({ where: { customerId: input.proposal.customerId } }),
    };
    const reconciliation = {
      oneBillingAuthority: true,
      legacyScheduleEnded: input.proposal.sourceKind === "manual_schedule",
      canonicalScheduleActive: true,
      canonicalSubscriptionActive: true,
      invoiceCountChanged: before.invoices !== after.invoices,
      paymentCountChanged: before.payments !== after.payments,
    };
    if (reconciliation.invoiceCountChanged || reconciliation.paymentCountChanged) {
      pilotError("PILOT_FINANCIAL_SIDE_EFFECT", "Cutover unexpectedly changed invoices or payments.");
    }

    await tx.canonicalManualPilotActivation.update({
      where: { id: activation.id },
      data: {
        status: "active",
        canonicalScheduleId: canonicalSchedule.id,
        activatedAt: new Date(),
        reconciliation: jsonValue(reconciliation),
      },
    });
    return {
      activationId: activation.id,
      activationKey: activation.activationKey,
      status: "active" as const,
      targetSubscriptionId: input.proposal.subscriptionId,
      sourceKind: input.proposal.sourceKind,
      legacyScheduleId: input.proposal.legacyScheduleId,
      sourceInvoiceId: input.proposal.sourceInvoiceId,
      canonicalScheduleId: canonicalSchedule.id,
      cutoverPeriodStart: input.proposal.cutoverPeriodStart,
      recurringAmount: input.proposal.recurringAmount,
      alreadyApplied: false,
      reconciliation,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  return error.code === "P2010" && error.meta?.code === "40001";
}

async function executeWithRetry(input: {
  activationId: string;
  proposal: CanonicalManualPilotProposal;
}): Promise<CanonicalManualPilotExecutionResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await executeActivationTransaction(input);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
    }
  }
  throw lastError;
}

export async function activateCanonicalManualPilot(input: {
  subscriptionId: string;
  authorization: CanonicalManualPilotAuthorization;
  execute: true;
  confirmation: typeof ACTIVATE_MANUAL_PILOT_CONFIRMATION;
  environment?: CanonicalManualPilotEnvironment;
  now?: Date;
}): Promise<CanonicalManualPilotExecutionResult> {
  if (!input.execute || input.confirmation !== ACTIVATE_MANUAL_PILOT_CONFIRMATION) {
    pilotError("PILOT_EXPLICIT_EXECUTION_REQUIRED", "Exact manual pilot execution confirmation is required.");
  }
  const review = await getCanonicalManualPilotReview(input.subscriptionId);
  if (review.blockers.length) pilotError("PILOT_REVIEW_BLOCKED", review.blockers.join(" "));
  assertCanonicalManualPilotAuthorization({
    proposal: review.proposal,
    authorization: input.authorization,
    environment: input.environment,
    now: input.now,
  });
  const activation = await registerApproval({
    proposal: review.proposal,
    authorization: input.authorization,
  });
  try {
    return await executeWithRetry({ activationId: activation.id, proposal: review.proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CanonicalManualPilotError
      ? error.code
      : "PILOT_TRANSACTION_FAILED";
    await prisma.canonicalManualPilotActivation.updateMany({
      where: { id: activation.id, status: { in: ["approved", "in_progress", "failed_rolled_back"] } },
      data: {
        status: "failed_rolled_back",
        failedAt: new Date(),
        failureCode: code,
        failureMessage: message.slice(0, 10_000),
      },
    });
    throw error;
  }
}

export type OwnerApprovedManualMigrationActivationInput = {
  subscriptionId: string;
  campaignEntryId: string;
  approvedByEmail: string;
  approvedAt: Date;
  approvalReason: string;
  expectedProposalFingerprint: string;
  expectedSourceStateFingerprint: string;
  confirmations: {
    customerAndServicesConfirmed: boolean;
    commercialTermsConfirmed: boolean;
    historicalBalancesConfirmed: boolean;
    legacyBillingStopConfirmed: boolean;
    canonicalBillingStartConfirmed: boolean;
  };
  environment?: CanonicalSubscriptionActivationEnvironment;
};

/**
 * Complete an owner-approved manual migration from inside TL Portal.
 *
 * Authentication and owner authorization are enforced by the calling Server
 * Action. This service binds that approval to the same immutable migration and
 * source-state fingerprints used by the original pilot mechanism, then reuses
 * the proven serializable cutover transaction. It never creates an invoice,
 * payment, notification, or provider operation.
 */
export async function activateOwnerApprovedManualMigration(
  input: OwnerApprovedManualMigrationActivationInput,
): Promise<CanonicalManualPilotExecutionResult> {
  const approvalReason = input.approvalReason.trim();
  if (!input.campaignEntryId.trim() || !input.approvedByEmail.trim() || !approvalReason) {
    pilotError("OWNER_APPROVAL_INCOMPLETE", "Owner identity, campaign approval, and a review note are required.");
  }
  if (!Object.values(input.confirmations).every(Boolean)) {
    pilotError("OWNER_CONFIRMATIONS_INCOMPLETE", "Confirm the customer, terms, history, and billing-authority transfer.");
  }

  const review = await getCanonicalManualPilotReview(input.subscriptionId);
  assertCanonicalSubscriptionActivationEnabled(input.environment, {
    customerId: review.proposal.customerId,
    subscriptionId: review.proposal.subscriptionId,
  });
  if (review.blockers.length) pilotError("PILOT_REVIEW_BLOCKED", review.blockers.join(" "));
  const proposalFingerprint = canonicalManualPilotProposalFingerprint(review.proposal);
  if (
    proposalFingerprint !== input.expectedProposalFingerprint
    || review.proposal.sourceStateFingerprint !== input.expectedSourceStateFingerprint
  ) {
    pilotError("PILOT_SOURCE_CHANGED", "The migration source changed after the confirmation screen was prepared.");
  }

  const [ledgerApproval, campaignEntry] = await Promise.all([
    prisma.canonicalMigrationLedger.findUnique({
      where: { id: review.proposal.migrationLedgerId },
      select: { approvedBy: true, approvalReason: true, approvedAt: true },
    }),
    prisma.canonicalMigrationCampaignEntry.findUnique({
      where: { id: input.campaignEntryId },
      select: {
        targetSubscriptionId: true,
        campaign: { select: { approvedBy: { select: { email: true } } } },
      },
    }),
  ]);
  const normalizedOwner = input.approvedByEmail.trim().toLowerCase();
  if (
    !ledgerApproval
    || !campaignEntry
    || campaignEntry.targetSubscriptionId !== review.proposal.subscriptionId
    || campaignEntry.campaign.approvedBy.email.trim().toLowerCase() !== normalizedOwner
    || ledgerApproval.approvedBy.trim().toLowerCase() !== normalizedOwner
  ) {
    pilotError("OWNER_APPROVAL_MISMATCH", "The durable owner approval does not match this migration target.");
  }

  // The migration ledger is unique per source arrangement, so use its durable
  // approval identity for retries and concurrent submissions. Identical owner
  // requests therefore converge on one activation.
  const issuedAt = ledgerApproval.approvedAt.toISOString();
  const authorization: CanonicalManualPilotAuthorization = {
    authorizationId: `owner-ledger:${review.proposal.migrationLedgerId}`,
    operation: "activate_manual_pilot",
    proposalFingerprint,
    approvedByEmail: input.approvedByEmail,
    customerId: review.proposal.customerId,
    subscriptionId: review.proposal.subscriptionId,
    migrationKey: review.proposal.migrationKey,
    sourceKind: review.proposal.sourceKind,
    legacyScheduleId: review.proposal.legacyScheduleId,
    sourceInvoiceId: review.proposal.sourceInvoiceId,
    sourceStateFingerprint: review.proposal.sourceStateFingerprint,
    cutoverPeriodStart: review.proposal.cutoverPeriodStart,
    billingIntervalMonths: review.proposal.billingIntervalMonths,
    currency: review.proposal.currency,
    recurringAmount: review.proposal.recurringAmount,
    approvalReason: ledgerApproval.approvalReason,
    customerIdentityConfirmed: input.confirmations.customerAndServicesConfirmed,
    commercialTermsConfirmed: input.confirmations.commercialTermsConfirmed,
    historicalBalancesConfirmed: input.confirmations.historicalBalancesConfirmed,
    legacyScheduleStopConfirmed: input.confirmations.legacyBillingStopConfirmed,
    canonicalScheduleStartConfirmed: input.confirmations.canonicalBillingStartConfirmed,
    recoveryProcedureConfirmed: true,
    issuedAt,
    expiresAt: new Date(input.approvedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    // Session authorization replaces the old external HMAC. This value is not
    // used as proof; the durable campaign IDs and fingerprints above are.
    signature: "authenticated-owner-session",
  };
  const activation = await registerApproval({ proposal: review.proposal, authorization });
  try {
    return await executeWithRetry({ activationId: activation.id, proposal: review.proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CanonicalManualPilotError ? error.code : "PILOT_TRANSACTION_FAILED";
    await prisma.canonicalManualPilotActivation.updateMany({
      where: { id: activation.id, status: { in: ["approved", "in_progress", "failed_rolled_back"] } },
      data: {
        status: "failed_rolled_back",
        failedAt: new Date(),
        failureCode: code,
        failureMessage: message.slice(0, 10_000),
      },
    });
    throw error;
  }
}
