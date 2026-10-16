import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import type {
  CanonicalStripeProviderMutationResult,
  CanonicalStripeProviderRateGroup,
} from "@/lib/domain/canonical-stripe-execution";

export function stripeMinorAmountToMajor(
  minor: number | string | null | undefined,
  minorUnitExponent = 2,
): string {
  if (!Number.isInteger(minorUnitExponent) || minorUnitExponent < 0 || minorUnitExponent > 6) {
    throw new Error("Stripe currency minor-unit exponent is invalid.");
  }
  return new Prisma.Decimal(minor ?? 0)
    .dividedBy(new Prisma.Decimal(10).pow(minorUnitExponent))
    .toDecimalPlaces(minorUnitExponent)
    .toFixed(minorUnitExponent);
}

export function stripeRecurringIntervalMonths(price: Stripe.Price): number | null {
  const recurring = price.recurring;
  if (!recurring) return null;
  const count = recurring.interval_count ?? 1;
  if (recurring.interval === "month") return count;
  if (recurring.interval === "year") return count * 12;
  return null;
}

export function stripePriceMajorAmount(
  price: Stripe.Price,
  minorUnitExponent = 2,
): string | null {
  if (price.unit_amount_decimal != null) {
    return stripeMinorAmountToMajor(price.unit_amount_decimal, minorUnitExponent);
  }
  if (price.unit_amount != null) {
    return stripeMinorAmountToMajor(price.unit_amount, minorUnitExponent);
  }
  return null;
}

export function canonicalStripeRateGroupFingerprint(
  item: Stripe.SubscriptionItem,
): string | null {
  const itemMetadata = (item as Stripe.SubscriptionItem & { metadata?: Stripe.Metadata }).metadata;
  return itemMetadata?.tl_rate_group_fingerprint?.trim()
    || item.price?.metadata?.tl_rate_group_fingerprint?.trim()
    || null;
}

export function normalizeCanonicalStripeSubscription(
  subscription: Stripe.Subscription,
  minorUnitExponent = 2,
): CanonicalStripeProviderMutationResult {
  const observedItems = subscription.items.data.map((item) => ({
    externalSubscriptionItemId: item.id,
    externalPriceId: item.price?.id ?? null,
    currency: item.price?.currency?.toUpperCase() ?? null,
    billingIntervalMonths: item.price ? stripeRecurringIntervalMonths(item.price) : null,
    unitAmount: item.price ? stripePriceMajorAmount(item.price, minorUnitExponent) : null,
    quantity: item.quantity ?? null,
  }));
  const rateGroups = subscription.items.data.flatMap<CanonicalStripeProviderRateGroup>((item) => {
    const fingerprint = canonicalStripeRateGroupFingerprint(item);
    const interval = item.price ? stripeRecurringIntervalMonths(item.price) : null;
    const amount = item.price ? stripePriceMajorAmount(item.price, minorUnitExponent) : null;
    if (!fingerprint || !item.price?.id || !item.price.currency || interval == null || amount == null) return [];
    return [{
      fingerprint,
      externalSubscriptionItemId: item.id,
      externalPriceId: item.price.id,
      currency: item.price.currency.toUpperCase(),
      billingIntervalMonths: interval,
      agreedAmountPerCycle: amount,
      quantity: item.quantity ?? 0,
    }];
  });
  return {
    subscription: {
      externalSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start == null
        ? null
        : new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: subscription.current_period_end == null
        ? null
        : new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items: observedItems,
    },
    rateGroups,
  };
}
