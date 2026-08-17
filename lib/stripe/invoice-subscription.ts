import type Stripe from "stripe";

/**
 * Subscription id on an Invoice, for both pre-Basil (`invoice.subscription`)
 * and Basil+ (`invoice.parent.subscription_details.subscription`) payloads.
 *
 * Webhook endpoints use the Dashboard API version, which can be newer than
 * stripe-node. Reading only the legacy field leaves `invoice.paid` unable to
 * load the subscription and (when metadata/billing-account lookup also miss)
 * skips renewal auto-advance while `customer.subscription.updated` still
 * flips the row to STRIPE · ACTIVE.
 *
 * @see https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects
 */
export function stripeInvoiceSubscriptionId(
  invoice: Stripe.Invoice | (Stripe.Invoice & Record<string, unknown>),
): string | null {
  const inv = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: {
      type?: string | null;
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
  };

  const fromLegacy = idFromStripeRef(inv.subscription);
  if (fromLegacy) return fromLegacy;

  const parent = inv.parent;
  if (!parent) return null;
  if (parent.type && parent.type !== "subscription_details") return null;
  return idFromStripeRef(parent.subscription_details?.subscription);
}

function idFromStripeRef(ref: string | { id?: string } | null | undefined): string | null {
  if (typeof ref === "string") {
    const id = ref.trim();
    return id || null;
  }
  const id = ref?.id?.trim();
  return id || null;
}
