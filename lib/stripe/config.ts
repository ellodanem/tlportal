import "server-only";

import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function isStripeBillingEnabled(): boolean {
  if (process.env.STRIPE_BILLING_ENABLED === "0" || process.env.STRIPE_BILLING_ENABLED === "false") {
    return false;
  }
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function assertStripeBillingEnabled(): void {
  if (!isStripeBillingEnabled()) {
    throw new Error(
      "Stripe billing is not enabled. Set STRIPE_SECRET_KEY and STRIPE_BILLING_ENABLED (omit or true).",
    );
  }
}

export function getStripeClient(): Stripe {
  assertStripeBillingEnabled();
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
