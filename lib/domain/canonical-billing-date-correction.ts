/**
 * Pure rules for correcting the billing dates of a canonical subscription that was
 * set up with the wrong start date.
 *
 * The same dates are copied onto several records when a subscription is created
 * (subscription, services, service rates, the derived recurring invoice schedule and
 * the installed devices' due dates). A correction therefore moves all of them
 * together, and is refused as soon as any billing has happened from the old dates:
 * an invoice, a provider (Stripe) link or a billing operation. Corrections after
 * that point need a credit or a reissued invoice, not a date edit.
 */

import { CanonicalSubscriptionValidationError, commercialDate, commercialDateString } from "./canonical-subscription-application";
import { isFirstPeriodTooLong } from "./subscription-proration";

export const BILLING_DATE_CORRECTION_LIFECYCLES = ["draft", "pending_activation", "active", "paused"] as const;

export type BillingDateCorrectionSnapshot = {
  controlMode: string;
  lifecycleStatus: string | null;
  collectionMethod: string | null;
  billingIntervalMonths: number | null;
  commercialStartDate: Date | null;
  billingAnchorDate: Date | null;
  nextBillingDate: Date | null;
  invoiceCount: number;
  billingInvoiceCount: number;
  billingOperationCount: number;
  providerLinkCount: number;
  /** Invoice created by the operational activation, if any. */
  initialInvoiceId: string | null;
  items: {
    id: string;
    label: string | null;
    serviceActivatedDate: Date | null;
    billingEffectiveFrom: Date | null;
    hasInitialAdjustment: boolean;
    /** Invoices that snapshotted this service's rate. */
    invoiceSnapshotCount: number;
  }[];
  schedules: { id: string; hasGeneratedInvoice: boolean }[];
};

export type BillingDateCorrectionPlan = {
  previous: { commercialStartDate: string; billingAnchorDate: string; nextBillingDate: string };
  next: { commercialStartDate: string; billingAnchorDate: string; nextBillingDate: string };
  /** Per-service new dates; a field is null when it is left as it is. */
  items: { id: string; serviceActivatedDate: string | null; billingEffectiveFrom: string | null }[];
};

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

const sameDay = (a: Date | null, b: Date | null) => Boolean(a && b && commercialDateString(a) === commercialDateString(b));

/** Reasons this subscription's dates cannot be edited. Empty means they can. */
export function billingDateCorrectionBlockers(snapshot: BillingDateCorrectionSnapshot): string[] {
  const blockers: string[] = [];
  if (snapshot.controlMode !== "canonical") blockers.push("Only canonical subscriptions can have their dates corrected.");
  if (!snapshot.lifecycleStatus || !(BILLING_DATE_CORRECTION_LIFECYCLES as readonly string[]).includes(snapshot.lifecycleStatus)) {
    blockers.push("The subscription has ended or been canceled.");
  }
  if (snapshot.collectionMethod !== "manual_invoice") {
    blockers.push("Only manual-invoice subscriptions can be corrected here. Stripe holds its own billing dates.");
  }
  if (!snapshot.billingIntervalMonths || !snapshot.commercialStartDate || !snapshot.nextBillingDate) {
    blockers.push("The subscription is missing its billing cadence or dates.");
  }
  if (snapshot.providerLinkCount > 0) blockers.push("A payment provider is linked, so its billing dates would no longer match.");
  if (snapshot.billingOperationCount > 0) blockers.push("Billing operations have already run for this subscription.");
  if (
    snapshot.invoiceCount > 0
    || snapshot.billingInvoiceCount > 0
    || snapshot.initialInvoiceId
    || snapshot.items.some((item) => item.invoiceSnapshotCount > 0)
  ) {
    blockers.push("An invoice has already been created from these dates. Adjust it with a credit or a reissued invoice instead.");
  }
  if (snapshot.schedules.some((schedule) => schedule.hasGeneratedInvoice)) {
    blockers.push("The recurring schedule has already generated an invoice.");
  }
  if (snapshot.items.some((item) => item.hasInitialAdjustment)) {
    blockers.push("A service has an agreed partial-period charge calculated from the current dates.");
  }
  return blockers;
}

/**
 * Validates the requested dates and works out exactly which dates move. Throws a
 * {@link CanonicalSubscriptionValidationError} with a staff-readable message.
 */
export function planBillingDateCorrection(
  snapshot: BillingDateCorrectionSnapshot,
  requested: { commercialStartDate: string; nextBillingDate: string },
): BillingDateCorrectionPlan {
  const blockers = billingDateCorrectionBlockers(snapshot);
  if (blockers.length) fail("BILLING_DATES_LOCKED", blockers[0]);

  const interval = snapshot.billingIntervalMonths!;
  const oldStart = snapshot.commercialStartDate!;
  const oldNext = snapshot.nextBillingDate!;
  const oldAnchor = snapshot.billingAnchorDate ?? oldStart;

  const newStart = commercialDate(requested.commercialStartDate, "Start date");
  const newNext = commercialDate(requested.nextBillingDate, "Next renewal date");
  if (sameDay(newStart, oldStart) && sameDay(newNext, oldNext)) fail("NO_CHANGE", "Those are already the saved dates.");
  if (newNext <= newStart) fail("RENEWAL_NOT_AFTER_START", "The renewal date must be after the start date.");

  if (isFirstPeriodTooLong(commercialDateString(newStart), commercialDateString(newNext), interval)) {
    fail(
      "RENEWAL_TOO_FAR",
      `The renewal cannot be more than two billing intervals (${interval * 2} months) after the start date. Extra unpaid months within that window are allowed as goodwill.`,
    );
  }

  // The anchor follows the start date when it was set from it; a deliberately different anchor stays.
  const newAnchor = sameDay(oldAnchor, oldStart) ? newStart : oldAnchor;
  if (newAnchor < newStart || newAnchor > newNext) {
    fail("ANCHOR_OUT_OF_RANGE", "The billing anchor date must fall between the start date and the renewal date.");
  }

  const items = snapshot.items.map((item) => {
    // Only dates that were copied from the old subscription dates move; deliberate dates stay.
    const activated = sameDay(item.serviceActivatedDate, oldStart) ? newStart : item.serviceActivatedDate;
    const billingFrom = sameDay(item.billingEffectiveFrom, oldStart)
      ? newStart
      : sameDay(item.billingEffectiveFrom, oldNext)
        ? newNext
        : item.billingEffectiveFrom;
    if (activated && billingFrom && billingFrom < activated) {
      fail("ITEM_DATES_CONFLICT", `${item.label?.trim() || "A service"} would start billing before it is activated. Adjust that service first.`);
    }
    return {
      id: item.id,
      serviceActivatedDate: !activated || sameDay(activated, item.serviceActivatedDate) ? null : commercialDateString(activated),
      billingEffectiveFrom: !billingFrom || sameDay(billingFrom, item.billingEffectiveFrom) ? null : commercialDateString(billingFrom),
    };
  });

  return {
    previous: {
      commercialStartDate: commercialDateString(oldStart),
      billingAnchorDate: commercialDateString(oldAnchor),
      nextBillingDate: commercialDateString(oldNext),
    },
    next: {
      commercialStartDate: commercialDateString(newStart),
      billingAnchorDate: commercialDateString(newAnchor),
      nextBillingDate: commercialDateString(newNext),
    },
    items,
  };
}
