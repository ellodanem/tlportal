/**
 * Rules for moving an active canonical subscription from Recurring invoices to Stripe
 * card billing by LINKING an existing Stripe subscription (no change is made in Stripe),
 * and for how a customer's Stripe flag follows their subscriptions.
 *
 * Pure so the safety rules are easy to read and test.
 */

export type StripeLinkSubject = {
  controlMode: "legacy" | "shadow" | "canonical";
  lifecycleStatus: string | null;
  collectionMethod: "manual_invoice" | "stripe_autocharge" | null;
  billingIntervalMonths: number | null;
  billingAnchorDate: Date | null;
  nextBillingDate: Date | null;
  /** Billable services (non-ended items) that carry an effective rate. */
  billableItemCount: number;
  hasOpenStripeLink: boolean;
};

/** Reasons linking must not proceed. Empty means the subscription is eligible. */
export function stripeLinkBlockers(subject: StripeLinkSubject): string[] {
  const blockers: string[] = [];
  if (subject.controlMode !== "canonical") {
    blockers.push("Only a subscription managed in the subscription workspace can be switched to Stripe.");
  }
  if (subject.lifecycleStatus !== "active") {
    blockers.push("The subscription must be active. Drafts choose their collection method during setup.");
  }
  if (subject.collectionMethod === "stripe_autocharge") {
    blockers.push("This subscription is already collected by Stripe.");
  } else if (subject.collectionMethod !== "manual_invoice") {
    blockers.push("This subscription has no collection method to switch from.");
  }
  if (subject.hasOpenStripeLink) {
    blockers.push("This subscription already has an open Stripe relationship.");
  }
  if (!subject.billingIntervalMonths || !subject.billingAnchorDate || !subject.nextBillingDate) {
    blockers.push("The billing cadence, anchor date and next renewal date must be set first.");
  }
  if (subject.billableItemCount < 1) {
    blockers.push("The subscription has no billable services to match against Stripe.");
  }
  return blockers;
}

/**
 * Customer-level flag derived from the customer's subscriptions: Stripe when any live
 * subscription is collected by Stripe auto-charge, otherwise manual. Only meaningful for
 * customers that have subscriptions in the subscription workspace.
 */
export function deriveCustomerBillingMode(
  collectionMethods: ReadonlyArray<"manual_invoice" | "stripe_autocharge" | null | undefined>,
): "stripe_subscription" | "manual_legacy" {
  return collectionMethods.some((method) => method === "stripe_autocharge") ? "stripe_subscription" : "manual_legacy";
}
