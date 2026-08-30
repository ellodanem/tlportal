import "server-only";

import type { Customer } from "@prisma/client";
import type Stripe from "stripe";

import { getAppBaseUrl } from "./app-url";
import {
  checkoutFeeBreakdown,
  checkoutProductCopy,
} from "./checkout-fee-copy";
import {
  resolveCheckoutLineItem,
  stripeCheckoutCurrency,
  type CheckoutLineItem,
} from "./checkout-pricing";
import { getStripeClient } from "./config";
import { ensureStripeCustomerForTlCustomer } from "./customer";

function lineItemFromResolved(item: CheckoutLineItem): Stripe.Checkout.SessionCreateParams.LineItem {
  const breakdown = checkoutFeeBreakdown({
    monthlyRateXcd: item.monthlyRateXcd,
    durationMonths: item.durationMonths,
    vehicleCount: item.quantity,
  });
  const product = checkoutProductCopy({
    durationMonths: item.durationMonths,
    vehicleCount: item.quantity,
    listedTotalXcd: breakdown.listedTotalXcd,
    cardTotalXcd: breakdown.cardTotalXcd,
  });

  return {
    price_data: {
      currency: stripeCheckoutCurrency(),
      product_data: {
        name: product.name,
        description: product.description,
      },
      unit_amount: breakdown.unitAmountCents,
      recurring: {
        interval: "month",
        interval_count: item.durationMonths,
      },
    },
    quantity: item.quantity,
  };
}

export async function createStripeSubscriptionCheckout(input: {
  customer: Customer;
  durationMonths: number;
  tlSubscriptionId: string;
  monthlyRateXcd?: number | null;
  vehicleCount: number;
  useCustomPricing?: boolean;
}): Promise<{ url: string; sessionId: string; pricingMode: "catalog" | "dynamic" }> {
  const monthlyRate = input.monthlyRateXcd ?? null;

  const resolved = await resolveCheckoutLineItem({
    durationMonths: input.durationMonths,
    monthlyRateXcd: monthlyRate,
    vehicleCount: input.vehicleCount,
    useCustomPricing: input.useCustomPricing,
  });
  if (!resolved) {
    throw new Error(
      `No Stripe checkout configuration for ${input.durationMonths} month plan.`,
    );
  }

  const effectiveMonthly = resolved.monthlyRateXcd;

  const { stripeCustomerId } = await ensureStripeCustomerForTlCustomer(input.customer);
  const stripe = getStripeClient();
  const base = getAppBaseUrl();
  const meta: Record<string, string> = {
    tl_customer_id: input.customer.id,
    tl_subscription_id: input.tlSubscriptionId,
    tl_duration_months: String(input.durationMonths),
    tl_vehicle_count: String(Math.max(1, input.vehicleCount)),
    tl_pricing_mode: "dynamic",
    tl_fee_passthrough: "1",
    tl_monthly_rate_xcd: String(effectiveMonthly),
  };

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

  return { url: session.url, sessionId: session.id, pricingMode: "dynamic" };
}
