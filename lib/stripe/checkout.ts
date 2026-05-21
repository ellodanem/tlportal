import "server-only";

import type { Customer } from "@prisma/client";
import type Stripe from "stripe";

import { getAppBaseUrl } from "./app-url";
import { getStripeClient } from "./config";
import {
  monthlyRateFromCustomer,
  resolveCheckoutLineItem,
  stripeCheckoutCurrency,
  xcdToStripeUnitAmount,
  type CheckoutLineItem,
} from "./checkout-pricing";
import { ensureStripeCustomerForTlCustomer } from "./customer";

function lineItemFromResolved(item: CheckoutLineItem): Stripe.Checkout.SessionCreateParams.LineItem {
  if (item.type === "price_id") {
    return { price: item.priceId, quantity: 1 };
  }

  const months = item.durationMonths;
  const productName =
    months === 1
      ? `Track Lucia — ${item.monthlyRateXcd} XCD / month`
      : `Track Lucia — ${months} months (${item.monthlyRateXcd} XCD / month)`;

  return {
    price_data: {
      currency: stripeCheckoutCurrency(),
      product_data: { name: productName },
      unit_amount: xcdToStripeUnitAmount(item.periodTotalXcd),
      recurring: {
        interval: "month",
        interval_count: months,
      },
    },
    quantity: 1,
  };
}

export async function createStripeSubscriptionCheckout(input: {
  customer: Customer;
  durationMonths: number;
  /** TL subscription row created before Checkout; linked via metadata. */
  tlSubscriptionId: string;
  /** Override customer.stripeMonthlyRateXcd for this session only. */
  monthlyRateXcd?: number | null;
}): Promise<{ url: string }> {
  const monthlyRate = input.monthlyRateXcd ?? null;

  const resolved = await resolveCheckoutLineItem({
    durationMonths: input.durationMonths,
    monthlyRateXcd: monthlyRate,
  });
  if (!resolved) {
    throw new Error(
      `No Stripe checkout configuration for ${input.durationMonths} month plan.`,
    );
  }

  const { stripeCustomerId } = await ensureStripeCustomerForTlCustomer(input.customer);
  const stripe = getStripeClient();
  const base = getAppBaseUrl();
  const meta: Record<string, string> = {
    tl_customer_id: input.customer.id,
    tl_subscription_id: input.tlSubscriptionId,
    tl_duration_months: String(input.durationMonths),
  };
  if (monthlyRate != null) {
    meta.tl_monthly_rate_xcd = String(monthlyRate);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [lineItemFromResolved(resolved)],
    success_url: `${base}/pay/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pay/cancel`,
    client_reference_id: input.customer.id,
    metadata: meta,
    subscription_data: {
      metadata: meta,
    },
    after_expiration: {
      recovery: {
        enabled: true,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  return { url: session.url };
}
