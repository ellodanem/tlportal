import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";

import {
  markCustomerSubscriptionCanceledFromStripe,
  upsertCustomerSubscriptionFromStripe,
} from "@/lib/services/customer-subscription-service";

import { parseStripeBillingMetadata, stripeMetadataFromSubscription } from "./metadata";

function tlCustomerIdFromSubscription(sub: Stripe.Subscription): string | null {
  const fromMeta = sub.metadata?.tl_customer_id?.trim();
  if (fromMeta) return fromMeta;
  return null;
}

/**
 * Mirror Stripe subscription state onto BillingAccount + Customer.billingMode.
 */
export async function syncStripeSubscriptionToDatabase(
  sub: Stripe.Subscription,
): Promise<{ customerId: string | null }> {
  const tlCustomerId = tlCustomerIdFromSubscription(sub);
  if (!tlCustomerId) {
    return { customerId: null };
  }

  const stripeCustomerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
  if (!stripeCustomerId) {
    return { customerId: null };
  }

  const meta = stripeMetadataFromSubscription(sub);

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: tlCustomerId },
      data: { billingMode: "stripe_subscription" },
    }),
    prisma.billingAccount.upsert({
      where: {
        customerId_provider: { customerId: tlCustomerId, provider: "stripe" },
      },
      create: {
        customerId: tlCustomerId,
        provider: "stripe",
        externalCustomerId: stripeCustomerId,
        mode: "stripe_subscription",
        status: sub.status,
        metadata: meta,
      },
      update: {
        externalCustomerId: stripeCustomerId,
        mode: "stripe_subscription",
        status: sub.status,
        metadata: meta,
      },
    }),
  ]);

  await upsertCustomerSubscriptionFromStripe(sub, tlCustomerId);

  return { customerId: tlCustomerId };
}

export async function markStripeSubscriptionCanceled(sub: Stripe.Subscription): Promise<void> {
  const tlCustomerId = tlCustomerIdFromSubscription(sub);
  if (!tlCustomerId) return;

  const existing = await prisma.billingAccount.findUnique({
    where: {
      customerId_provider: { customerId: tlCustomerId, provider: "stripe" },
    },
    select: { metadata: true },
  });
  const prior = parseStripeBillingMetadata(existing?.metadata);

  await prisma.billingAccount.update({
    where: {
      customerId_provider: { customerId: tlCustomerId, provider: "stripe" },
    },
    data: {
      status: "canceled",
      metadata: {
        ...prior,
        ...stripeMetadataFromSubscription(sub),
      },
    },
  });

  await markCustomerSubscriptionCanceledFromStripe(sub, tlCustomerId);
}
