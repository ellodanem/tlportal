import "server-only";

import { Prisma, type CanonicalInitialBillingMode } from "@prisma/client";

import { addUtcDays, addUtcMonths, startOfUtcDay } from "@/lib/billing/recurring-period";
import { prisma } from "@/lib/db";
import {
  assertCanonicalSubscriptionActivationEnabled,
  type CanonicalSubscriptionActivationEnvironment,
} from "@/lib/domain/canonical-subscription-activation";
import {
  CanonicalSubscriptionValidationError,
  canonicalBillingInterval,
  normalizeCurrency,
} from "@/lib/domain/canonical-subscription-application";
import { resolveCanonicalBillingCycle } from "@/lib/domain/canonical-native-billing";
import { persistCanonicalInvoiceSnapshots, type CanonicalScheduleBillingCycle } from "@/lib/services/canonical-native-billing-service";
import { createDraftInvoiceInTransaction, finalizeInvoiceInTransaction } from "@/lib/services/native-invoice-service";

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

function sameUtcDay(left: Date, right: Date): boolean {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

function activationKey(subscriptionId: string): string {
  return `canonical-operational-activation:${subscriptionId}`;
}

function initialInvoiceKey(subscriptionId: string, periodStart: Date): string {
  return `canonical-initial:${subscriptionId}:${startOfUtcDay(periodStart).toISOString()}`;
}

function retryableSerializationError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2034" || error.code === "P2010" && error.meta?.code === "40001";
}

async function runSerializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      if (!retryableSerializationError(error) || attempt === 3) throw error;
    }
  }
  throw lastError;
}

export type CanonicalInitialCharge = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type CanonicalInitialBillingInput = {
  mode: CanonicalInitialBillingMode;
  /** Required only for advance billing. Dates describe a half-open service period. */
  periodStart?: Date | null;
  periodEnd?: Date | null;
  issueDate?: Date | null;
  dueDaysAfterIssue?: number | null;
  oneTimeCharges?: CanonicalInitialCharge[];
};

export type ActivateCanonicalManualSubscriptionInput = {
  subscriptionId: string;
  staffUserId: string;
  confirmationNote: string;
  initialBilling?: CanonicalInitialBillingInput;
  /**
   * Internal bulk-migration path. A completed shadow is promoted only inside
   * this transaction, together with ending the old manual schedule. It never
   * creates an invoice, payment, provider mutation, or notification.
   */
  promoteMigrationShadow?: boolean;
  legacyScheduleId?: string | null;
  environment?: CanonicalSubscriptionActivationEnvironment;
};

export type CanonicalManualActivationResult = {
  scheduleId: string;
  initialInvoiceId: string | null;
  reused: boolean;
};

function validateInitialCharges(charges: CanonicalInitialCharge[] | undefined): CanonicalInitialCharge[] {
  const normalized = charges ?? [];
  if (normalized.length > 25) fail("TOO_MANY_INITIAL_CHARGES", "At most 25 one-time charges can be included on the first invoice.");
  return normalized.map((charge) => {
    const description = charge.description.trim();
    if (!description) fail("INITIAL_CHARGE_DESCRIPTION_REQUIRED", "Every one-time charge needs a description.");
    if (!Number.isFinite(charge.quantity) || charge.quantity <= 0 || charge.quantity > 10_000) {
      fail("INITIAL_CHARGE_QUANTITY_INVALID", "One-time charge quantities must be positive and reasonable.");
    }
    if (!Number.isFinite(charge.unitPrice) || charge.unitPrice < 0 || charge.unitPrice > 1_000_000) {
      fail("INITIAL_CHARGE_PRICE_INVALID", "One-time charge prices must be non-negative and reasonable.");
    }
    return { description, quantity: charge.quantity, unitPrice: charge.unitPrice };
  });
}

/**
 * Staff-approved canonical manual activation. All commercial state, recurring
 * schedule, optional initial invoice, and audit record are committed together.
 * It never sends an invoice, records a payment, calls Stripe, or sends a
 * customer notification.
 */
export async function activateCanonicalManualSubscription(
  input: ActivateCanonicalManualSubscriptionInput,
): Promise<CanonicalManualActivationResult> {
  const confirmationNote = input.confirmationNote.trim();
  if (!input.staffUserId) fail("STAFF_REQUIRED", "A signed-in staff member must perform activation.");
  if (!confirmationNote) fail("CONFIRMATION_NOTE_REQUIRED", "Record the staff commercial review before activation.");

  return runSerializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${input.subscriptionId} FOR UPDATE`;
    const subscription = await tx.customerSubscription.findUnique({
      where: { id: input.subscriptionId },
      include: {
        operationalActivation: true,
        items: { include: { rates: true } },
        recurringSchedules: { where: { status: { not: "ended" } } },
      },
    });
    if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Canonical subscription not found.");
    const promotingMigrationShadow = input.promoteMigrationShadow === true && subscription.controlMode === "shadow";
    const requestedInitialBilling = input.initialBilling ?? { mode: "deferred" as const };
    const migrationPromotion = promotingMigrationShadow
      && Boolean(input.legacyScheduleId)
      && requestedInitialBilling.mode === "deferred"
      && !(requestedInitialBilling.oneTimeCharges?.length);
    assertCanonicalSubscriptionActivationEnabled(input.environment, {
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
    }, { migrationPromotion });
    if ((!promotingMigrationShadow && subscription.controlMode !== "canonical") || subscription.collectionMethod !== "manual_invoice") {
      fail("MANUAL_CANONICAL_REQUIRED", "Only a canonical manual-invoice subscription can be activated here.");
    }
    if (subscription.operationalActivation) {
      if (subscription.recurringSchedules.length !== 1) fail("SCHEDULE_OWNERSHIP_AMBIGUOUS", "The activated agreement does not have exactly one open recurring schedule.");
      return {
        scheduleId: subscription.recurringSchedules[0].id,
        initialInvoiceId: subscription.operationalActivation.initialInvoiceId,
        reused: true,
      };
    }
    if (!promotingMigrationShadow && subscription.lifecycleStatus !== "draft" && subscription.lifecycleStatus !== "pending_activation") {
      fail("INVALID_LIFECYCLE", "Only a draft or pending canonical subscription can be activated.");
    }
    if (!subscription.nextBillingDate || !subscription.billingIntervalMonths || !subscription.currency) {
      fail("INCOMPLETE_SUBSCRIPTION", "Billing date, interval, and currency are required before activation.");
    }
    if (subscription.recurringSchedules.length > 1) fail("SCHEDULE_OWNERSHIP_AMBIGUOUS", "More than one open recurring schedule owns this subscription.");

    if (input.legacyScheduleId) {
      const legacySchedule = await tx.recurringInvoiceSchedule.findUnique({
        where: { id: input.legacyScheduleId },
        select: { id: true, customerId: true, customerSubscriptionId: true, status: true },
      });
      if (!legacySchedule || legacySchedule.customerId !== subscription.customerId) {
        fail("LEGACY_SCHEDULE_MISMATCH", "The legacy recurring schedule does not belong to this subscription's customer.");
      }
      if (legacySchedule.customerSubscriptionId === subscription.id) {
        fail("LEGACY_SCHEDULE_MISMATCH", "The legacy recurring schedule is already attached to the canonical subscription.");
      }
      if (legacySchedule.status === "ended") {
        fail("LEGACY_SCHEDULE_ENDED", "The legacy recurring schedule was already ended before canonical activation.");
      }
    }

    const interval = canonicalBillingInterval(subscription.billingIntervalMonths);
    const billable = subscription.items.filter((item) => item.status !== "ended" && item.status !== "canceled");
    if (!billable.length) fail("SUBSCRIPTION_HAS_NO_ITEMS", "Activation requires at least one billable service.");
    for (const item of billable) {
      if (!item.serviceActivatedDate || !item.billingEffectiveFrom) {
        fail("INCOMPLETE_ITEM", "Every activated service requires activation and billing-effective dates.");
      }
      const rates = item.rates.filter((rate) => rate.billingIntervalMonths === interval && normalizeCurrency(rate.currency) === normalizeCurrency(subscription.currency!));
      if (!rates.length) fail("ITEM_RATE_AMBIGUOUS", "Every activated service needs an effective cycle rate.");
    }

    const initialBilling = requestedInitialBilling;
    const oneTimeCharges = validateInitialCharges(initialBilling.oneTimeCharges);
    if (initialBilling.mode === "deferred" && oneTimeCharges.length) {
      fail("DEFERRED_INITIAL_CHARGES", "One-time installation or hardware charges require an initial invoice.");
    }

    let initialInvoiceId: string | null = null;
    let initialCycle: CanonicalScheduleBillingCycle | null = null;
    let initialIssueDate: Date | null = null;
    let dueDaysAfterIssue = subscription.gracePeriodDays;
    if (initialBilling.mode === "advance_invoice") {
      if (!initialBilling.periodStart || !initialBilling.periodEnd || !initialBilling.issueDate) {
        fail("INITIAL_PERIOD_REQUIRED", "Advance billing requires an issue date and explicit service coverage dates.");
      }
      const periodStart = startOfUtcDay(initialBilling.periodStart);
      const periodEnd = startOfUtcDay(initialBilling.periodEnd);
      const issueDate = startOfUtcDay(initialBilling.issueDate);
      initialIssueDate = issueDate;
      if (periodEnd <= periodStart || !sameUtcDay(periodEnd, addUtcMonths(periodStart, interval))) {
        fail("INITIAL_PERIOD_INTERVAL_MISMATCH", "Initial coverage must be exactly one agreed billing interval.");
      }
      if (!sameUtcDay(periodEnd, subscription.nextBillingDate)) {
        fail("INITIAL_PERIOD_RENEWAL_MISMATCH", "Initial coverage must end on the configured next billing date.");
      }
      if (subscription.commercialStartDate && periodStart < startOfUtcDay(subscription.commercialStartDate)) {
        fail("INITIAL_PERIOD_BEFORE_COMMERCIAL_START", "Initial coverage cannot begin before the commercial start date.");
      }
      const requestedDueDays = initialBilling.dueDaysAfterIssue ?? subscription.gracePeriodDays;
      if (!Number.isInteger(requestedDueDays) || requestedDueDays < 0 || requestedDueDays > 365) {
        fail("INITIAL_DUE_DAYS_INVALID", "Initial invoice terms must use 0 to 365 due days.");
      }
      dueDaysAfterIssue = requestedDueDays;
      const cycle = resolveCanonicalBillingCycle({
        lifecycleStatus: "active",
        billingIntervalMonths: subscription.billingIntervalMonths,
        currency: subscription.currency,
        items: billable.map((item) => ({
          id: item.id,
          label: item.label,
          status: "active",
          billingEffectiveFrom: item.billingEffectiveFrom,
          billingEffectiveUntil: item.billingEffectiveUntil,
          rates: item.rates.map((rate) => ({
            id: rate.id,
            billingIntervalMonths: rate.billingIntervalMonths,
            agreedAmountPerCycle: rate.agreedAmountPerCycle,
            currency: rate.currency,
            effectiveFrom: rate.effectiveFrom,
            effectiveUntil: rate.effectiveUntil,
            classification: rate.classification,
          })),
        })),
      }, periodStart);
      initialCycle = {
        ...cycle,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        scheduleId: "",
        periodEnd,
      };
    }

    const schedule = subscription.recurringSchedules[0] ?? await tx.recurringInvoiceSchedule.create({
      data: {
        status: "active",
        name: subscription.name ?? "Canonical tracking subscription",
        customerId: subscription.customerId,
        customerSubscriptionId: subscription.id,
        currency: normalizeCurrency(subscription.currency),
        intervalMonths: interval,
        nextIssueDate: subscription.nextBillingDate,
        dueDaysAfterIssue: subscription.gracePeriodDays,
        // Activation never sends a customer message. Existing staff delivery and
        // invoice-notification controls remain the only notification path.
        autoEmail: false,
        createdById: input.staffUserId,
        lineItems: { create: billable.map((item, sortOrder) => {
          const rate = item.rates.find((candidate) => candidate.billingIntervalMonths === interval && normalizeCurrency(candidate.currency) === normalizeCurrency(subscription.currency!));
          if (!rate) fail("ITEM_RATE_AMBIGUOUS", "Every activated service needs an effective cycle rate.");
          return {
            sortOrder,
            description: item.label?.trim() || "Tracking service",
            quantity: 1,
            unitPrice: rate.agreedAmountPerCycle,
            lineTotal: rate.agreedAmountPerCycle,
          };
        }) },
      },
      select: { id: true },
    });

    if (initialCycle) {
      initialCycle.scheduleId = schedule.id;
      const existingInvoice = await tx.invoice.findUnique({
        where: { canonicalInitialGenerationKey: initialInvoiceKey(subscription.id, initialCycle.periodStart) },
        select: { id: true },
      });
      initialInvoiceId = existingInvoice?.id ?? await createDraftInvoiceInTransaction(tx, {
        kind: "one_off",
        customerId: subscription.customerId,
        customerSubscriptionId: subscription.id,
        canonicalInitialGenerationKey: initialInvoiceKey(subscription.id, initialCycle.periodStart),
        currency: initialCycle.currency,
        issueDate: initialIssueDate!,
        dueDate: addUtcDays(initialIssueDate!, dueDaysAfterIssue),
        notes: `Initial canonical service coverage: ${initialCycle.periodStart.toISOString().slice(0, 10)} to ${initialCycle.periodEnd.toISOString().slice(0, 10)}.`,
        createdById: input.staffUserId,
        lineItems: [
          ...initialCycle.lines.map((line, sortOrder) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unitPrice: Number(line.billedAmount),
            unitLabel: "service",
            sortOrder,
          })),
          ...oneTimeCharges.map((charge, index) => ({
            description: charge.description,
            quantity: charge.quantity,
            unitPrice: charge.unitPrice,
            unitLabel: "one-time",
            sortOrder: initialCycle!.lines.length + index,
          })),
        ],
      });
      if (!existingInvoice) {
        await persistCanonicalInvoiceSnapshots(tx, initialInvoiceId, initialCycle, { allowAdditionalLines: oneTimeCharges.length > 0, allocationNotes: "Initial canonical service period" });
        await finalizeInvoiceInTransaction(tx, initialInvoiceId);
      }
    }

    const performedAt = new Date();
    await tx.canonicalSubscriptionOperationalActivation.create({
      data: {
        customerSubscriptionId: subscription.id,
        customerId: subscription.customerId,
        activationKey: activationKey(subscription.id),
        initialBillingMode: initialBilling.mode,
        initialPeriodStart: initialCycle?.periodStart ?? null,
        initialPeriodEnd: initialCycle?.periodEnd ?? null,
        initialInvoiceId,
        approvedById: input.staffUserId,
        approvedAt: performedAt,
        performedById: input.staffUserId,
        performedAt,
        confirmationNote,
      },
    });
    await tx.customerSubscription.update({ where: { id: subscription.id }, data: { lifecycleStatus: "active", status: "active", collectionHealth: "not_started" } });
    if (promotingMigrationShadow) {
      await tx.customerSubscription.update({ where: { id: subscription.id }, data: { controlMode: "canonical" } });
    }
    if (input.legacyScheduleId) {
      const ended = await tx.recurringInvoiceSchedule.updateMany({
        where: { id: input.legacyScheduleId, customerId: subscription.customerId, status: { not: "ended" } },
        data: { status: "ended" },
      });
      if (ended.count !== 1) fail("LEGACY_SCHEDULE_END_FAILED", "The legacy recurring schedule could not be retired.");
    }
    await tx.subscriptionItem.updateMany({ where: { customerSubscriptionId: subscription.id, status: { in: ["draft", "pending_activation"] } }, data: { status: "active" } });
    return { scheduleId: schedule.id, initialInvoiceId, reused: false };
  });
}
