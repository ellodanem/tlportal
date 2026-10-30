import "server-only";

import { Prisma, type SubscriptionAdjustmentMethod } from "@prisma/client";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { addUtcDays, startOfUtcDay } from "@/lib/billing/recurring-period";
import { prisma } from "@/lib/db";
import {
  annualAdjustmentConfirmationToken,
  annualAdjustmentGenerationKey,
  assertCanonicalAnnualAdjustmentExecutionEnabled,
  CanonicalAnnualAdjustmentError,
  canonicalAnnualAdjustmentExecutionEnabled,
  resolveCurrentAnnualPeriod,
  type CanonicalAnnualAdjustmentEnvironment,
} from "@/lib/domain/canonical-annual-adjustment";
import {
  commercialDateString,
  normalizeCurrency,
  previewAnnualProration,
} from "@/lib/domain/canonical-subscription-application";
import { cycleWindowForRenewal } from "@/lib/domain/subscription-proration";
import {
  createDraftInvoiceInTransaction,
  finalizeInvoiceInTransaction,
} from "@/lib/services/native-invoice-service";

type AdjustmentDb = Pick<
  Prisma.TransactionClient,
  "subscriptionItem" | "invoice" | "invoiceLineItem" | "invoiceServiceSnapshot" | "subscriptionItemInitialAdjustment"
>;

export type AnnualAdjustmentInvoiceStatus = {
  invoiceId: string;
  number: string | null;
  status: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  issueDate: Date;
  dueDate: Date | null;
};

export type AnnualServiceAdjustmentProposal = {
  subscriptionId: string;
  customerId: string;
  subscriptionItemId: string;
  subscriptionItemRateId: string;
  serviceLabel: string;
  collectionMethod: "manual_invoice" | "stripe_autocharge";
  currency: string;
  agreedAnnualAmount: string;
  serviceActivationDate: string;
  periodStart: string;
  periodEnd: string;
  totalCalendarDays: number;
  remainingCalendarDays: number;
  proratedAmount: string;
  nextRecurringBillingDate: string;
  generationKey: string;
  confirmationToken: string;
  invoiceRequired: boolean;
  executionEnabled: boolean;
  existingInvoice: AnnualAdjustmentInvoiceStatus | null;
  /** How the amount was determined. Daily proration is used when no agreed adjustment is recorded. */
  method: SubscriptionAdjustmentMethod;
  /** Daily-engine amount for the same period, shown so an override stays explainable. */
  dailyAmount: string;
  isOverride: boolean;
  overrideReason: string | null;
  billingIntervalMonths: number;
};

export type CreateAnnualAdjustmentInvoiceInput = {
  subscriptionItemId: string;
  generationKey: string;
  confirmationToken: string;
  confirmed: boolean;
  authorizedById: string;
  issueDate?: Date;
  dueDaysAfterIssue?: number;
  allowOnlinePayment?: boolean;
  /**
   * Default true (number + open). Staff-facing creation passes false so the invoice
   * stays an unnumbered, unsent DRAFT that can be customized (extra line items such as
   * a hardware fee, dates, notes) and finalized deliberately from the invoice editor.
   */
  finalize?: boolean;
  environment?: CanonicalAnnualAdjustmentEnvironment;
};

export type CreateAnnualAdjustmentInvoiceResult = {
  created: boolean;
  invoiceRequired: boolean;
  invoice: AnnualAdjustmentInvoiceStatus | null;
  proposal: AnnualServiceAdjustmentProposal | null;
  sourceDiscrepancy: boolean;
  sourceValidationIssues: { code: string; message: string }[];
};

function adjustmentError(code: string, message: string): never {
  throw new CanonicalAnnualAdjustmentError(code, message);
}

function sameUtcDay(left: Date, right: Date): boolean {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

function invoiceStatus(row: {
  id: string;
  number: string | null;
  status: string;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  issueDate: Date;
  dueDate: Date | null;
}): AnnualAdjustmentInvoiceStatus {
  return {
    invoiceId: row.id,
    number: row.number,
    status: row.status,
    total: row.total.toFixed(2),
    amountPaid: row.amountPaid.toFixed(2),
    amountDue: row.amountDue.toFixed(2),
    issueDate: row.issueDate,
    dueDate: row.dueDate,
  };
}

const adjustmentInvoiceSelect = {
  id: true,
  number: true,
  status: true,
  total: true,
  amountPaid: true,
  amountDue: true,
  issueDate: true,
  dueDate: true,
} satisfies Prisma.InvoiceSelect;

async function findAdjustmentInvoice(
  db: AdjustmentDb,
  generationKey: string,
): Promise<AnnualAdjustmentInvoiceStatus | null> {
  const row = await db.invoice.findUnique({
    where: { adjustmentGenerationKey: generationKey },
    select: adjustmentInvoiceSelect,
  });
  return row ? invoiceStatus(row) : null;
}

async function resolveProposal(
  db: AdjustmentDb,
  subscriptionItemId: string,
  environment: CanonicalAnnualAdjustmentEnvironment,
): Promise<AnnualServiceAdjustmentProposal> {
  const item = await db.subscriptionItem.findUnique({
    where: { id: subscriptionItemId },
    include: {
      initialAdjustment: true,
      rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] },
      customerSubscription: {
        include: {
          customer: true,
          recurringSchedules: {
            where: { status: { not: "ended" } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });
  if (!item) adjustmentError("ITEM_NOT_FOUND", "Subscription item not found.");

  const subscription = item.customerSubscription;
  const agreed = item.initialAdjustment;
  if (subscription.controlMode === "legacy") {
    adjustmentError("LEGACY_SUBSCRIPTION_PROTECTED", "Legacy subscriptions cannot use canonical annual adjustments.");
  }
  const intervalMonths = subscription.billingIntervalMonths;
  if (intervalMonths == null) {
    adjustmentError("INCOMPLETE_SUBSCRIPTION", "A billing interval is required for adjustment billing.");
  }
  // Without an agreed adjustment the original annual-only daily engine applies unchanged.
  if (!agreed && intervalMonths !== 12) {
    adjustmentError("NOT_ANNUAL", "Only an annual service without a recorded agreed adjustment uses the daily engine; record an agreed adjustment for other cadences.");
  }
  if (!subscription.nextBillingDate || !subscription.currency || (!agreed && !subscription.billingAnchorDate)) {
    adjustmentError("INCOMPLETE_SUBSCRIPTION", "Billing anchor, next billing date, and currency are required.");
  }
  if (
    subscription.collectionMethod !== "manual_invoice"
    && subscription.collectionMethod !== "stripe_autocharge"
  ) {
    adjustmentError("COLLECTION_METHOD_UNSUPPORTED", "The subscription collection method is incomplete or unsupported.");
  }
  if (item.status !== "active") {
    adjustmentError("ITEM_NOT_ACTIVE", "The added subscription item must be active before adjustment billing.");
  }
  if (!item.serviceActivatedDate || !item.billingEffectiveFrom) {
    adjustmentError("ITEM_DATES_INCOMPLETE", "Service activation and recurring billing dates are required.");
  }

  // An agreed adjustment carries its own explicit period, so it also works for a new
  // subscription whose first renewal was aligned to an earlier cycle. Otherwise the
  // period is derived from the preserved anniversary cadence as before.
  const { periodStart, periodEnd } = agreed
    ? (() => {
      const end = startOfUtcDay(subscription.nextBillingDate!);
      const window = cycleWindowForRenewal(commercialDateString(end), intervalMonths);
      return { periodStart: new Date(`${window.cycleStart}T00:00:00.000Z`), periodEnd: end };
    })()
    : resolveCurrentAnnualPeriod({
      billingAnchorDate: subscription.billingAnchorDate!,
      nextBillingDate: subscription.nextBillingDate!,
    });
  if (agreed && !sameUtcDay(agreed.periodEnd, periodEnd)) {
    adjustmentError(
      "AGREED_ADJUSTMENT_RENEWAL_CHANGED",
      "The renewal date changed after this adjustment was agreed; record a new agreement before invoicing.",
    );
  }
  if (!sameUtcDay(item.billingEffectiveFrom, periodEnd)) {
    adjustmentError(
      "RECURRING_EFFECTIVE_DATE_MISMATCH",
      "The added service must join recurring billing on the preserved annual renewal date.",
    );
  }
  if (item.billingEffectiveUntil && item.billingEffectiveUntil <= item.billingEffectiveFrom) {
    adjustmentError("ITEM_DATES_INVALID", "The item's recurring billing period is invalid.");
  }

  const currency = normalizeCurrency(subscription.currency);
  const effectiveRates = item.rates.filter((rate) =>
    rate.billingIntervalMonths === intervalMonths
    && normalizeCurrency(rate.currency) === currency
    && rate.effectiveFrom <= item.serviceActivatedDate!
    && (rate.effectiveUntil == null || item.serviceActivatedDate! < rate.effectiveUntil));
  if (effectiveRates.length !== 1) {
    adjustmentError(
      effectiveRates.length === 0 ? "ITEM_RATE_MISSING" : "ITEM_RATE_AMBIGUOUS",
      "The added service must have exactly one cycle rate effective on its activation date.",
    );
  }
  const rate = effectiveRates[0];
  const dailyPreview = agreed
    ? null
    : previewAnnualProration({
      annualPeriodStart: commercialDateString(periodStart),
      annualPeriodEnd: commercialDateString(periodEnd),
      serviceActivatedDate: commercialDateString(item.serviceActivatedDate),
      agreedAnnualAmount: rate.agreedAmountPerCycle,
      currency,
    });
  const preview = dailyPreview ?? (() => {
    const activation = startOfUtcDay(item.serviceActivatedDate!);
    const total = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
    const remaining = Math.round((periodEnd.getTime() - activation.getTime()) / 86_400_000);
    if (activation < periodStart || activation > periodEnd) {
      adjustmentError("ACTIVATION_OUTSIDE_CYCLE", "The service start falls outside the cycle this adjustment covers.");
    }
    return {
      currency,
      periodStart: commercialDateString(periodStart),
      periodEnd: commercialDateString(periodEnd),
      prorationStart: commercialDateString(activation),
      futureRecurringEffectiveDate: commercialDateString(periodEnd),
      totalCalendarDays: total,
      remainingCalendarDays: remaining,
      agreedAnnualAmount: new Prisma.Decimal(rate.agreedAmountPerCycle),
      proratedAmount: new Prisma.Decimal(agreed!.amount),
    };
  })();
  const dailyAmount = agreed
    ? new Prisma.Decimal(agreed.dailyAmount).toFixed(2)
    : preview.proratedAmount.toFixed(2);
  const generationKey = annualAdjustmentGenerationKey(item.id, periodStart, periodEnd);
  const confirmationToken = annualAdjustmentConfirmationToken({
    subscriptionId: subscription.id,
    subscriptionItemId: item.id,
    subscriptionItemRateId: rate.id,
    generationKey,
    collectionMethod: subscription.collectionMethod,
    preview,
  });
  const existingInvoice = await findAdjustmentInvoice(db, generationKey);

  return {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    subscriptionItemId: item.id,
    subscriptionItemRateId: rate.id,
    serviceLabel: item.label?.trim() || "Tracking service",
    collectionMethod: subscription.collectionMethod,
    currency,
    agreedAnnualAmount: preview.agreedAnnualAmount.toFixed(2),
    serviceActivationDate: preview.prorationStart,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    totalCalendarDays: preview.totalCalendarDays,
    remainingCalendarDays: preview.remainingCalendarDays,
    proratedAmount: preview.proratedAmount.toFixed(2),
    nextRecurringBillingDate: preview.futureRecurringEffectiveDate,
    generationKey,
    confirmationToken,
    invoiceRequired: preview.proratedAmount.greaterThan(0),
    executionEnabled: canonicalAnnualAdjustmentExecutionEnabled(environment),
    existingInvoice,
    method: agreed?.method ?? "daily_proration",
    dailyAmount,
    isOverride: agreed ? agreed.method !== "daily_proration" || dailyAmount !== preview.proratedAmount.toFixed(2) : false,
    overrideReason: agreed?.reason ?? null,
    billingIntervalMonths: intervalMonths,
  };
}

/** Read-only data for UI-1 preview/status surfaces. */
export async function getAnnualServiceAdjustmentProposal(
  subscriptionItemId: string,
  environment: CanonicalAnnualAdjustmentEnvironment = process.env,
): Promise<AnnualServiceAdjustmentProposal> {
  return resolveProposal(prisma, subscriptionItemId, environment);
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2034" || error.code === "P2010" && error.meta?.code === "40001";
}

async function existingResultAfterSourceChange(
  tx: Prisma.TransactionClient,
  input: CreateAnnualAdjustmentInvoiceInput,
  invoice: AnnualAdjustmentInvoiceStatus,
): Promise<CreateAnnualAdjustmentInvoiceResult> {
  const snapshot = await tx.invoiceServiceSnapshot.findFirst({
    where: { invoiceId: invoice.invoiceId, subscriptionItemId: input.subscriptionItemId },
    select: { id: true },
  });
  if (!snapshot) {
    adjustmentError("IDEMPOTENCY_KEY_CONFLICT", "The adjustment key belongs to a different subscription item.");
  }
  try {
    const proposal = await resolveProposal(tx, input.subscriptionItemId, input.environment ?? process.env);
    const sourceDiscrepancy = proposal.confirmationToken !== input.confirmationToken
      || proposal.proratedAmount !== invoice.total;
    return {
      created: false,
      invoiceRequired: true,
      invoice,
      proposal,
      sourceDiscrepancy,
      sourceValidationIssues: sourceDiscrepancy
        ? [{ code: "SOURCE_CHANGED_AFTER_INVOICE", message: "The current service configuration differs from the immutable issued adjustment." }]
        : [],
    };
  } catch (caught) {
    if (!(caught instanceof CanonicalAnnualAdjustmentError)) throw caught;
    return {
      created: false,
      invoiceRequired: true,
      invoice,
      proposal: null,
      sourceDiscrepancy: true,
      sourceValidationIssues: [{ code: caught.code, message: caught.message }],
    };
  }
}

async function executeAdjustmentTransaction(
  input: CreateAnnualAdjustmentInvoiceInput,
): Promise<CreateAnnualAdjustmentInvoiceResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "SubscriptionItem"
      WHERE "id" = ${input.subscriptionItemId}
      FOR UPDATE
    `;
    if (!locked.length) adjustmentError("ITEM_NOT_FOUND", "Subscription item not found.");

    const existing = await findAdjustmentInvoice(tx, input.generationKey);
    if (existing) return existingResultAfterSourceChange(tx, input, existing);

    const proposal = await resolveProposal(tx, input.subscriptionItemId, input.environment ?? process.env);
    if (proposal.generationKey !== input.generationKey) {
      adjustmentError("STALE_ADJUSTMENT_KEY", "The annual adjustment period changed; review a fresh preview.");
    }
    if (proposal.confirmationToken !== input.confirmationToken) {
      adjustmentError("STALE_ADJUSTMENT_PREVIEW", "The annual adjustment terms changed; review and confirm again.");
    }
    if (proposal.existingInvoice) {
      return existingResultAfterSourceChange(tx, input, proposal.existingInvoice);
    }
    if (!proposal.invoiceRequired) {
      return {
        created: false,
        invoiceRequired: false,
        invoice: null,
        proposal,
        sourceDiscrepancy: false,
        sourceValidationIssues: [],
      };
    }

    const conflictingSnapshot = await tx.invoiceServiceSnapshot.findFirst({
      where: {
        subscriptionItemId: proposal.subscriptionItemId,
        servicePeriodStart: new Date(`${proposal.serviceActivationDate}T00:00:00.000Z`),
        servicePeriodEnd: new Date(`${proposal.periodEnd}T00:00:00.000Z`),
        invoice: { kind: "annual_adjustment", status: { notIn: ["void", "written_off"] } },
      },
      select: { invoiceId: true },
    });
    if (conflictingSnapshot) {
      adjustmentError("ADJUSTMENT_ALREADY_BILLED", "This service and annual period already have an adjustment invoice.");
    }

    const item = await tx.subscriptionItem.findUniqueOrThrow({
      where: { id: proposal.subscriptionItemId },
      include: { customerSubscription: { include: { customer: true, recurringSchedules: true } } },
    });
    const subscription = item.customerSubscription;
    if (subscription.controlMode !== "canonical") {
      adjustmentError("CANONICAL_CONTROL_REQUIRED", "Only canonical-controlled subscriptions may create adjustments.");
    }
    if (subscription.lifecycleStatus !== "active") {
      adjustmentError("SUBSCRIPTION_NOT_ACTIVE", "Annual adjustment execution requires an active subscription.");
    }
    const openSchedules = subscription.recurringSchedules.filter((schedule) => schedule.status !== "ended");
    if (subscription.collectionMethod === "manual_invoice" && openSchedules.length > 1) {
      adjustmentError("SCHEDULE_AMBIGUOUS", "Manual annual billing has more than one open recurring schedule.");
    }
    const schedule = openSchedules[0] ?? null;
    const issueDate = startOfUtcDay(input.issueDate ?? new Date());
    const dueDays = input.dueDaysAfterIssue ?? schedule?.dueDaysAfterIssue ?? 30;
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
      adjustmentError("INVALID_DUE_DAYS", "Adjustment invoice due days must be a whole number from 0 to 365.");
    }
    const billToLines = customerBillToLines(subscription.customer);
    const invoiceId = await createDraftInvoiceInTransaction(tx, {
      kind: "annual_adjustment",
      adjustmentGenerationKey: proposal.generationKey,
      customerId: subscription.customerId,
      customerSubscriptionId: subscription.id,
      billToName: customerDisplayName(subscription.customer),
      billToLines,
      currency: proposal.currency,
      issueDate,
      dueDate: addUtcDays(issueDate, dueDays),
      notes: `Prorated service addition through ${proposal.periodEnd}${proposal.isOverride ? ` (${proposal.method.replaceAll("_", " ")} adjustment agreed with the customer)` : ""}.`,
      paymentInstructions: schedule?.paymentInstructions ?? null,
      allowOnlinePayment: subscription.collectionMethod === "stripe_autocharge"
        || input.allowOnlinePayment === true,
      createdById: input.authorizedById,
      lineItems: [{
        description: `${proposal.serviceLabel} — prorated ${proposal.billingIntervalMonths === 12 ? "annual " : ""}adjustment`,
        quantity: 1,
        unitPrice: Number(proposal.proratedAmount),
        unitLabel: "service",
      }],
    });
    const line = await tx.invoiceLineItem.findFirstOrThrow({
      where: { invoiceId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    await tx.invoiceServiceSnapshot.create({
      data: {
        invoiceId,
        invoiceLineItemId: line.id,
        subscriptionItemId: proposal.subscriptionItemId,
        subscriptionItemRateId: proposal.subscriptionItemRateId,
        serviceLabelSnapshot: proposal.serviceLabel,
        agreedAmountPerCycleSnapshot: proposal.agreedAnnualAmount,
        billedAmount: proposal.proratedAmount,
        currency: proposal.currency,
        servicePeriodStart: new Date(`${proposal.serviceActivationDate}T00:00:00.000Z`),
        servicePeriodEnd: new Date(`${proposal.periodEnd}T00:00:00.000Z`),
        quantity: "1.0000",
        allocationNotes: proposal.method === "daily_proration"
          ? `${proposal.remainingCalendarDays}/${proposal.totalCalendarDays} calendar days in annual period ${proposal.periodStart} to ${proposal.periodEnd}; half-up to 2 decimals.`
          : `Agreed ${proposal.method.replaceAll("_", " ")} adjustment of ${proposal.proratedAmount} (daily engine: ${proposal.dailyAmount}) for ${proposal.serviceActivationDate} to ${proposal.periodEnd}${proposal.overrideReason ? `; reason: ${proposal.overrideReason}` : ""}.`,
      },
    });
    // Link the agreed adjustment to the exact invoice that bills it. The unique
    // invoiceId makes "invoiced" a stored fact rather than something inferred.
    await tx.subscriptionItemInitialAdjustment.updateMany({
      where: { subscriptionItemId: proposal.subscriptionItemId, invoiceId: null },
      data: { invoiceId },
    });
    if (input.finalize !== false) await finalizeInvoiceInTransaction(tx, invoiceId);
    const invoiceRow = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: adjustmentInvoiceSelect,
    });
    return {
      created: true,
      invoiceRequired: true,
      invoice: invoiceStatus(invoiceRow),
      proposal: { ...proposal, existingInvoice: invoiceStatus(invoiceRow) },
      sourceDiscrepancy: false,
      sourceValidationIssues: [],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Explicitly confirmed, local/test-only creation. This creates an open native
 * invoice but never sends it, creates Checkout, charges Stripe, advances a
 * schedule, or mutates provider subscription quantities.
 */
export async function createAnnualServiceAdjustmentInvoice(
  input: CreateAnnualAdjustmentInvoiceInput,
): Promise<CreateAnnualAdjustmentInvoiceResult> {
  assertCanonicalAnnualAdjustmentExecutionEnabled(input.environment);
  if (!input.confirmed) {
    adjustmentError("EXPLICIT_CONFIRMATION_REQUIRED", "Explicit adjustment invoice confirmation is required.");
  }
  if (!input.authorizedById.trim()) {
    adjustmentError("AUTHORIZED_USER_REQUIRED", "The authorizing staff user is required.");
  }
  if (!input.generationKey.trim() || !input.confirmationToken.trim()) {
    adjustmentError("PREVIEW_CONFIRMATION_REQUIRED", "A reviewed adjustment preview is required.");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await executeAdjustmentTransaction(input);
    } catch (caught) {
      lastError = caught;
      if (!isRetryableTransactionError(caught)) throw caught;
    }
  }
  throw lastError;
}
