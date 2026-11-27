/**
 * Pure rules for ending one canonical billing arrangement and starting another at a
 * different cadence, then collecting the new cycle by card.
 *
 * Cadence is identity of a CustomerSubscription. A 6-month agreement cannot become a
 * 3-month agreement in place: rates, the derived recurring schedule, and Stripe Prices
 * all key off billingIntervalMonths. The commercial move is therefore a new agreement
 * plus a transfer of live services. Historical invoices stay on the source.
 */

import { Prisma } from "@prisma/client";

import {
  SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS,
  type SupportedSubscriptionIntervalMonths,
} from "./canonical-subscription";
import {
  CanonicalSubscriptionValidationError,
  canonicalBillingInterval,
  commercialDate,
  commercialDateString,
  exactCycleAmount,
} from "./canonical-subscription-application";
import { cadenceLabel } from "./subscription-proration";

export const TERM_RETARGET_INVOICE_DISPOSITIONS = ["void", "leave"] as const;
export type TermRetargetInvoiceDisposition = (typeof TERM_RETARGET_INVOICE_DISPOSITIONS)[number];

const LIVE_STATUSES = new Set(["draft", "pending_activation", "active", "paused"]);
const MANAGEABLE_LIFECYCLES = ["pending_activation", "active"] as const;
const VOIDABLE_INVOICE_STATUSES = new Set(["open", "overdue"]);

export type TermRetargetInvoice = {
  id: string;
  number: string | null;
  amountDue: string;
  currency: string;
  status: string;
};

export type TermRetargetLiveService = {
  id: string;
  label: string;
  status: string;
  currentAmount: string;
  currentIntervalMonths: number;
};

export type TermRetargetPanelService = TermRetargetLiveService & {
  suggestedAmount: string;
};

export type TermRetargetSnapshot = {
  id: string;
  name: string | null;
  customerId: string;
  controlMode: string;
  lifecycleStatus: string | null;
  collectionMethod: string | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  nextBillingDate: Date | null;
  hasMigrationLedger: boolean;
  hasOpenStripeLink: boolean;
  customerEmail: string | null;
  stripeBillingEnabled: boolean;
  liveServices: TermRetargetLiveService[];
  openInvoices: TermRetargetInvoice[];
};

export type TermRetargetServiceAmount = {
  itemId: string;
  agreedAmountPerCycle: string;
};

export type TermRetargetPlanInput = {
  targetIntervalMonths: number;
  firstChargeDate: string;
  invoiceDisposition: TermRetargetInvoiceDisposition | null;
  serviceAmounts: TermRetargetServiceAmount[];
  today?: Date;
};

export type TermRetargetPlan = {
  sourceId: string;
  customerId: string;
  sourceIntervalMonths: SupportedSubscriptionIntervalMonths;
  targetIntervalMonths: SupportedSubscriptionIntervalMonths;
  firstChargeDate: string;
  transferDate: string;
  destinationName: string;
  currency: string;
  cycleTotal: string;
  invoiceDisposition: TermRetargetInvoiceDisposition | null;
  voidInvoiceIds: string[];
  services: Array<{
    sourceItemId: string;
    label: string;
    agreedAmountPerCycle: string;
  }>;
};

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

export function isTermRetargetInvoiceDisposition(
  value: string | null | undefined,
): value is TermRetargetInvoiceDisposition {
  return value === "void" || value === "leave";
}

/** Prefer a shorter renewal when leaving a 6- or 12-month term; otherwise the next supported cadence. */
export function defaultTermRetargetInterval(
  currentMonths: number | null,
): SupportedSubscriptionIntervalMonths {
  if (currentMonths === 6) return 3;
  if (currentMonths === 12) return 6;
  const next = SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS.find((months) => months !== currentMonths);
  return next ?? 3;
}

export function suggestedSuccessorCycleAmount(
  currentAmount: string,
  fromMonths: number,
  toMonths: number,
): Prisma.Decimal {
  const from = canonicalBillingInterval(fromMonths);
  const to = canonicalBillingInterval(toMonths);
  const amount = exactCycleAmount(currentAmount, "currentAmount");
  if (from === to) return amount;
  return amount.times(to).dividedBy(from).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function destinationAgreementName(sourceName: string | null, targetIntervalMonths: number): string {
  const generated = `${cadenceLabel(targetIntervalMonths)} GPS tracking`;
  const trimmed = sourceName?.trim() ?? "";
  if (!trimmed) return generated;
  if (/monthly|quarterly|annual|every \d+ months|\d+-month/i.test(trimmed)) return generated;
  return trimmed;
}

function utcDayString(value: Date): string {
  return commercialDateString(value);
}

/** Reasons this agreement cannot change term and collect by card. Empty means it can. */
export function termRetargetBlockers(
  snapshot: TermRetargetSnapshot,
  targetIntervalMonths?: number,
): string[] {
  const blockers: string[] = [];
  if (snapshot.controlMode !== "canonical") {
    blockers.push("Only a subscription workspace agreement can change term.");
  }
  if (snapshot.hasMigrationLedger) {
    blockers.push("It is a migration record, which keeps its own source authority.");
  }
  if (!snapshot.lifecycleStatus || !(MANAGEABLE_LIFECYCLES as readonly string[]).includes(snapshot.lifecycleStatus)) {
    blockers.push("Only a pending or active agreement can change term.");
  }
  if (snapshot.collectionMethod !== "manual_invoice") {
    blockers.push("Only a recurring-invoice agreement can change term here. Card billing already has its own provider schedule.");
  }
  if (snapshot.hasOpenStripeLink) {
    blockers.push("This agreement already has a card on file.");
  }
  if (!snapshot.billingIntervalMonths) {
    blockers.push("Set the current billing cadence before changing term.");
  }
  if (!snapshot.currency) {
    blockers.push("Set the currency before changing term.");
  }
  const live = snapshot.liveServices.filter((service) => LIVE_STATUSES.has(service.status));
  if (live.some((service) => service.status === "paused")) {
    blockers.push("Resume or end paused services before changing term. A paused service must not join the new cycle.");
  }
  if (!live.filter((service) => service.status !== "paused").length) {
    blockers.push("There are no live services to move onto a new term.");
  }
  if (!snapshot.customerEmail?.trim()) {
    blockers.push("The customer needs a billing email before Stripe Checkout can be sent.");
  }
  if (!snapshot.stripeBillingEnabled) {
    blockers.push("Stripe billing is not enabled in this environment.");
  }
  if (targetIntervalMonths != null) {
    try {
      const target = canonicalBillingInterval(targetIntervalMonths);
      if (snapshot.billingIntervalMonths && target === snapshot.billingIntervalMonths) {
        blockers.push(`This agreement is already ${cadenceLabel(target).toLowerCase()}. Choose a different term.`);
      }
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : "Billing interval is invalid.");
    }
  }
  return blockers;
}

function amountForService(
  service: TermRetargetLiveService,
  targetIntervalMonths: number,
  serviceAmounts: TermRetargetServiceAmount[],
): Prisma.Decimal {
  const entered = serviceAmounts.find((row) => row.itemId === service.id);
  if (entered) return exactCycleAmount(entered.agreedAmountPerCycle, `${service.label || "Service"} amount`);
  return suggestedSuccessorCycleAmount(
    service.currentAmount,
    service.currentIntervalMonths,
    targetIntervalMonths,
  );
}

/**
 * Builds the commercial plan for a term change. Callers must still create the destination
 * agreement, transfer each live service, optionally void source invoices, and send pay-now
 * Checkout on the new agreement.
 */
export function planTermRetarget(
  snapshot: TermRetargetSnapshot,
  input: TermRetargetPlanInput,
): TermRetargetPlan {
  const targetIntervalMonths = canonicalBillingInterval(input.targetIntervalMonths);
  const blockers = termRetargetBlockers(snapshot, targetIntervalMonths);
  if (blockers.length) fail("NOT_ELIGIBLE", blockers.join(" "));

  const sourceIntervalMonths = canonicalBillingInterval(snapshot.billingIntervalMonths!);
  const firstChargeDate = commercialDate(input.firstChargeDate, "firstChargeDate");
  const today = input.today ?? new Date();
  if (utcDayString(firstChargeDate) > utcDayString(today)) {
    fail("FUTURE_CHARGE_DATE", "Pay-now charges today. Use Collect card, bill later if the first charge should wait.");
  }

  const live = snapshot.liveServices.filter((service) => LIVE_STATUSES.has(service.status) && service.status !== "paused");
  if (!live.length) {
    fail("NO_LIVE_SERVICES", "There are no live services to move onto a new term.");
  }
  const paused = snapshot.liveServices.filter((service) => service.status === "paused");
  if (paused.length) {
    fail("PAUSED_SERVICES", "Resume or end paused services before changing term. A paused service must not join the new cycle.");
  }

  const unknownAmount = input.serviceAmounts.find((row) => !live.some((service) => service.id === row.itemId));
  if (unknownAmount) {
    fail("UNKNOWN_SERVICE", "A priced service is not on this agreement.");
  }

  if (snapshot.openInvoices.length) {
    if (!isTermRetargetInvoiceDisposition(input.invoiceDisposition)) {
      fail(
        "INVOICE_DISPOSITION_REQUIRED",
        "Choose whether to void the overdue invoice or leave it collectable on the old agreement.",
      );
    }
    if (input.invoiceDisposition === "void") {
      const partial = snapshot.openInvoices.filter((invoice) => invoice.status === "partially_paid");
      if (partial.length) {
        fail(
          "PARTIAL_INVOICE_CANNOT_VOID",
          "A partially paid invoice cannot be voided. Leave it collectable, or settle the remainder first.",
        );
      }
      const notVoidable = snapshot.openInvoices.filter((invoice) => !VOIDABLE_INVOICE_STATUSES.has(invoice.status));
      if (notVoidable.length) {
        fail("INVOICE_NOT_VOIDABLE", "Only open or overdue invoices can be voided as part of a term change.");
      }
    }
  } else if (input.invoiceDisposition) {
    fail("NO_OPEN_INVOICE", "There is no open invoice to void or leave.");
  }

  const services = live.map((service) => ({
    sourceItemId: service.id,
    label: service.label,
    agreedAmountPerCycle: amountForService(service, targetIntervalMonths, input.serviceAmounts).toFixed(2),
  }));
  const cycleTotal = services
    .reduce((total, service) => total.plus(exactCycleAmount(service.agreedAmountPerCycle)), new Prisma.Decimal(0))
    .toFixed(2);
  const disposition = snapshot.openInvoices.length ? input.invoiceDisposition : null;

  return {
    sourceId: snapshot.id,
    customerId: snapshot.customerId,
    sourceIntervalMonths,
    targetIntervalMonths,
    firstChargeDate: commercialDateString(firstChargeDate),
    transferDate: commercialDateString(firstChargeDate),
    destinationName: destinationAgreementName(snapshot.name, targetIntervalMonths),
    currency: snapshot.currency!,
    cycleTotal,
    invoiceDisposition: disposition,
    voidInvoiceIds: disposition === "void" ? snapshot.openInvoices.map((invoice) => invoice.id) : [],
    services,
  };
}
