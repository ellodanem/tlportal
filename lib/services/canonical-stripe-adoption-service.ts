import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  buildCanonicalStripeRateGroups,
  reconcileCanonicalStripeSubscription,
  type CanonicalStripeRateGroupPlan,
  type LocalStripeProviderItem,
  type LocalStripeProviderLink,
  type ObservedStripeRecurringItem,
} from "@/lib/domain/canonical-stripe-shadow";
import { normalizeCanonicalStripeSubscription } from "@/lib/stripe/canonical-provider-normalization";
import { getStripeClient } from "@/lib/stripe/config";

export class CanonicalStripeAdoptionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeAdoptionError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new CanonicalStripeAdoptionError(code, message);
}

function exact(value: Prisma.Decimal | string | null): string | null {
  if (value == null) return null;
  try {
    return new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2);
  } catch {
    return null;
  }
}

export type ExistingStripeProviderMapping = {
  externalSubscriptionItemId: string;
  externalPriceId: string;
  currency: string;
  billingIntervalMonths: number;
  agreedAmountPerCycle: string;
  quantity: number;
  rateGroupFingerprint: string;
};

/**
 * Maps only exact, one-to-one rate groups. Any ambiguity is deliberately left
 * for review rather than guessing which live Stripe item represents a service.
 */
export function matchExistingStripeProviderItems(
  expected: CanonicalStripeRateGroupPlan,
  observed: ObservedStripeRecurringItem[],
): ExistingStripeProviderMapping[] {
  const unclaimed = new Set(observed.map((item) => item.externalSubscriptionItemId));
  const mappings: ExistingStripeProviderMapping[] = [];

  for (const group of expected.groups) {
    const amount = group.agreedAmountPerCycle.toFixed(2);
    const candidates = observed.filter((item) => unclaimed.has(item.externalSubscriptionItemId)
      && item.externalPriceId
      && item.currency?.toUpperCase() === group.currency
      && item.billingIntervalMonths === group.billingIntervalMonths
      && item.quantity === group.quantity
      && exact(item.unitAmount) === amount);
    if (candidates.length !== 1) {
      fail(
        candidates.length ? "AMBIGUOUS_PROVIDER_RATE_GROUP" : "PROVIDER_RATE_GROUP_MISMATCH",
        `Stripe does not contain one exact item for the ${group.quantity} × ${group.currency} ${amount} ${group.billingIntervalMonths}-month canonical rate group.`,
      );
    }
    const item = candidates[0]!;
    unclaimed.delete(item.externalSubscriptionItemId);
    mappings.push({
      externalSubscriptionItemId: item.externalSubscriptionItemId,
      externalPriceId: item.externalPriceId!,
      currency: item.currency!.toUpperCase(),
      billingIntervalMonths: item.billingIntervalMonths!,
      agreedAmountPerCycle: amount,
      quantity: item.quantity!,
      rateGroupFingerprint: group.fingerprint,
    });
  }
  if (unclaimed.size) {
    fail("UNEXPECTED_PROVIDER_RATE_GROUP", "Stripe has a recurring item that is not represented by this canonical subscription.");
  }
  return mappings;
}

export async function adoptExistingStripeSubscription(input: {
  subscriptionId: string;
  adoptedById: string;
}): Promise<{ externalSubscriptionId: string; mappingCount: number; nextBillingDate: Date }> {
  const configuration = await prisma.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
    include: {
      items: { include: { rates: true } },
      providerLinks: { where: { provider: "stripe", endedAt: null }, include: { providerItems: true } },
    },
  });
  if (!configuration) fail("SUBSCRIPTION_NOT_FOUND", "Canonical subscription not found.");
  if (configuration.controlMode !== "shadow" || configuration.collectionMethod !== "stripe_autocharge") {
    fail("STRIPE_SHADOW_REQUIRED", "Only an unadopted Stripe migration record can be connected to existing Stripe billing.");
  }
  if (!configuration.nextBillingDate) fail("NEXT_BILLING_DATE_REQUIRED", "A next billing date is required before adopting Stripe billing.");
  if (configuration.providerLinks.length !== 1) fail("PROVIDER_LINK_AMBIGUOUS", "Exactly one open Stripe relationship is required.");
  const link = configuration.providerLinks[0]!;
  if (link.providerItems.length) fail("PROVIDER_MAPPING_EXISTS", "This Stripe relationship already has a provider-item mapping.");

  const stripeSubscription = await getStripeClient().subscriptions.retrieve(link.externalSubscriptionId, {
    expand: ["items.data.price"],
  });
  if (process.env.NODE_ENV === "production" && stripeSubscription.livemode !== true) {
    fail("LIVE_STRIPE_REQUIRED", "Production adoption requires the existing live Stripe subscription.");
  }
  const observed = normalizeCanonicalStripeSubscription(stripeSubscription).subscription;
  const expected = buildCanonicalStripeRateGroups(configuration, configuration.nextBillingDate, { requireActive: false });
  const mappings = matchExistingStripeProviderItems(expected, observed.items);
  const localLink: LocalStripeProviderLink = {
    id: link.id,
    customerSubscriptionId: configuration.id,
    provider: "stripe",
    externalSubscriptionId: link.externalSubscriptionId,
    providerStatus: observed.status,
    endedAt: null,
    providerItems: mappings.map((item): LocalStripeProviderItem => ({ id: "pending", subscriptionProviderLinkId: link.id, ...item })),
  };
  const reconciliation = reconcileCanonicalStripeSubscription({ expected, providerLink: localLink, observed });
  if (reconciliation.status !== "matched") {
    fail("STRIPE_RECONCILIATION_FAILED", reconciliation.issues.map((issue) => issue.explanation).join(" "));
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${configuration.id} FOR UPDATE`;
    const current = await tx.customerSubscription.findUnique({
      where: { id: configuration.id },
      include: { providerLinks: { where: { id: link.id }, include: { providerItems: true } } },
    });
    if (!current || current.controlMode !== "shadow") fail("ADOPTION_STATE_CHANGED", "This migration record changed before Stripe adoption completed.");
    const currentLink = current.providerLinks[0];
    if (!currentLink || currentLink.providerItems.length || currentLink.externalSubscriptionId !== link.externalSubscriptionId) {
      fail("ADOPTION_STATE_CHANGED", "The recorded Stripe relationship changed before adoption completed.");
    }
    await tx.subscriptionProviderLink.update({
      where: { id: link.id },
      data: {
        providerStatus: observed.status,
        lastSyncedAt: new Date(),
        lastError: null,
        providerItems: { create: mappings },
      },
    });
    await tx.customerSubscription.update({
      where: { id: configuration.id },
      data: { controlMode: "canonical", lifecycleStatus: "active", status: "active" },
    });
  });
  return { externalSubscriptionId: link.externalSubscriptionId, mappingCount: mappings.length, nextBillingDate: configuration.nextBillingDate };
}
