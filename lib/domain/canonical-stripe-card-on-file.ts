import { startOfUtcDay } from "@/lib/billing/recurring-period";

export const CARD_ON_FILE_PROVIDER_MODE = "card_on_file";
export const CARD_ON_FILE_OPERATION_PREFIX = "canonical-card-on-file:";

export const LIVE_STRIPE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid"] as const;

export class CanonicalStripeCardOnFileError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeCardOnFileError";
    this.code = code;
  }
}

export type CardOnFileSubject = {
  controlMode: "legacy" | "shadow" | "canonical";
  lifecycleStatus: string | null;
  collectionMethod: "manual_invoice" | "stripe_autocharge" | null;
  billingIntervalMonths: number | null;
  nextBillingDate: Date | null;
  billableItemCount: number;
  hasOpenStripeLink: boolean;
  customerEmail: string | null;
  stripeBillingEnabled: boolean;
  today?: Date;
};

export type LeftoverStripeSubscription = {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  linkedSubscriptionId: string | null;
};

export type LeftoverStripeInvoice = {
  id: string;
  status: string;
  amountDue: string;
  currency: string;
};

export function isLiveStripeSubscriptionStatus(status: string): boolean {
  return (LIVE_STRIPE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function cardOnFileOperationKey(subscriptionId: string): string {
  return `${CARD_ON_FILE_OPERATION_PREFIX}${subscriptionId}`;
}

export function isCardOnFileOperationKey(operationKey: string | null | undefined): boolean {
  return Boolean(operationKey?.startsWith(CARD_ON_FILE_OPERATION_PREFIX));
}

export function isCardOnFileProviderMode(value: string | null | undefined): boolean {
  return value?.trim() === CARD_ON_FILE_PROVIDER_MODE;
}

/** Reasons Checkout must not be created. Empty means the local subscription is eligible. */
export function cardOnFileCheckoutBlockers(subject: CardOnFileSubject): string[] {
  const blockers: string[] = [];
  if (!subject.stripeBillingEnabled) {
    blockers.push("Stripe billing is not enabled in this environment.");
  }
  if (subject.controlMode !== "canonical") {
    blockers.push("Only a subscription managed in the subscription workspace can collect a card.");
  }
  if (!["draft", "pending_activation", "active"].includes(subject.lifecycleStatus ?? "")) {
    blockers.push("The subscription must be a draft, pending activation, or active.");
  }
  if (subject.hasOpenStripeLink) {
    blockers.push("This subscription already has an open Stripe relationship.");
  }
  if (!subject.billingIntervalMonths || !subject.nextBillingDate) {
    blockers.push("Set the billing cadence and first charge date before collecting a card.");
  }
  if (subject.nextBillingDate) {
    const today = startOfUtcDay(subject.today ?? new Date());
    if (startOfUtcDay(subject.nextBillingDate).getTime() <= today.getTime()) {
      blockers.push("The first charge date must be after today. For a complimentary month, set the next renewal about one billing cycle from today.");
    }
  }
  if (subject.billableItemCount < 1) {
    blockers.push("The subscription has no billable services to put on the card.");
  }
  if (!subject.customerEmail?.trim()) {
    blockers.push("The customer needs a billing email before Stripe Checkout can be sent.");
  }
  return blockers;
}

export function leftoverStripeStartFreshDecision(input: {
  subscriptions: LeftoverStripeSubscription[];
  openInvoices: LeftoverStripeInvoice[];
}): {
  liveSubscriptions: LeftoverStripeSubscription[];
  canceledSubscriptions: LeftoverStripeSubscription[];
  foreignLiveSubscriptions: LeftoverStripeSubscription[];
  openInvoices: LeftoverStripeInvoice[];
  collectibleInvoices: LeftoverStripeInvoice[];
  requiresExplicitCancel: boolean;
  foreignBlocker: string | null;
  summary: string;
} {
  const liveSubscriptions = input.subscriptions.filter((entry) => isLiveStripeSubscriptionStatus(entry.status));
  const canceledSubscriptions = input.subscriptions.filter((entry) => !isLiveStripeSubscriptionStatus(entry.status));
  const foreignLiveSubscriptions = liveSubscriptions.filter((entry) => entry.linkedSubscriptionId != null);
  const collectibleInvoices = input.openInvoices.filter((invoice) => Number(invoice.amountDue) > 0);
  const foreignBlocker = foreignLiveSubscriptions.length
    ? "This Stripe customer already has a live subscription linked to another TL Portal agreement. Resolve that first so two card subscriptions are not billed."
    : null;
  const requiresExplicitCancel = !foreignBlocker && (liveSubscriptions.length > 0 || collectibleInvoices.length > 0);
  let summary = "No live Stripe subscription or open invoice remains. A new card-on-file Checkout can start fresh.";
  if (foreignBlocker) {
    summary = foreignBlocker;
  } else if (requiresExplicitCancel) {
    const parts: string[] = [];
    if (liveSubscriptions.length) {
      parts.push(`${liveSubscriptions.length} live Stripe subscription${liveSubscriptions.length === 1 ? "" : "s"}`);
    }
    if (collectibleInvoices.length) {
      parts.push(`${collectibleInvoices.length} open Stripe invoice${collectibleInvoices.length === 1 ? "" : "s"}`);
    }
    summary = `Cancel ${parts.join(" and ")} before collecting a new card. Stripe does not delete subscriptions; canceling and voiding open invoices starts fresh.`;
  } else if (canceledSubscriptions.length) {
    summary = "A previous Stripe subscription is already canceled and nothing is due. You can collect a new card without changing Stripe history.";
  }
  return {
    liveSubscriptions,
    canceledSubscriptions,
    foreignLiveSubscriptions,
    openInvoices: input.openInvoices,
    collectibleInvoices,
    requiresExplicitCancel,
    foreignBlocker,
    summary,
  };
}
