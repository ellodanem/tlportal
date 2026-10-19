import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalStripeShadowEnabled,
  buildCanonicalStripeRateGroups,
  CanonicalStripeShadowError,
  planCanonicalStripeInvoiceAttribution,
  planCanonicalStripeOperations,
  reconcileCanonicalStripeSubscription,
  type CanonicalStripeShadowEnvironment,
  type LocalStripeProviderLink,
  type ObservedStripeInvoiceLine,
  type ObservedStripeSubscription,
} from "@/lib/domain/canonical-stripe-shadow";

const stripeShadowSubscriptionInclude = {
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] } },
  },
  providerLinks: {
    where: { provider: "stripe" },
    orderBy: [{ activatedAt: "desc" }, { id: "asc" }],
    include: { providerItems: { orderBy: [{ rateGroupFingerprint: "asc" }, { id: "asc" }] } },
  },
} satisfies Prisma.CustomerSubscriptionInclude;

function shadowError(code: string, message: string): never {
  throw new CanonicalStripeShadowError(code, message);
}

function providerLinkInput(link: {
  id: string;
  customerSubscriptionId: string;
  provider: string;
  externalSubscriptionId: string;
  providerStatus: string | null;
  endedAt: Date | null;
  providerItems: {
    id: string;
    subscriptionProviderLinkId: string;
    externalSubscriptionItemId: string;
    externalPriceId: string;
    currency: string;
    billingIntervalMonths: number;
    agreedAmountPerCycle: Prisma.Decimal;
    quantity: number;
    rateGroupFingerprint: string;
  }[];
}): LocalStripeProviderLink {
  return link;
}

export type CanonicalStripeShadowReadModel = {
  subscriptionId: string;
  customerId: string;
  controlMode: "shadow" | "canonical";
  expectedRecurringTotal: string;
  currency: string;
  billingIntervalMonths: 1 | 3 | 4 | 6 | 12;
  billingAnchorDate: Date;
  nextBillingDate: Date;
  rateGroups: {
    fingerprint: string;
    agreedAmountPerCycle: string;
    quantity: number;
    recurringTotal: string;
    subscriptionItems: {
      subscriptionItemId: string;
      subscriptionItemRateId: string;
      serviceLabel: string;
      classification: "standard" | "negotiated";
    }[];
  }[];
  provider: {
    activeLinkId: string | null;
    externalSubscriptionId: string | null;
    providerStatus: string | null;
    historicalLinks: {
      id: string;
      externalSubscriptionId: string;
      providerStatus: string | null;
      activatedAt: Date;
      endedAt: Date;
    }[];
  };
  reconciliation: ReturnType<typeof reconcileCanonicalStripeSubscription>;
  operationPreview: ReturnType<typeof planCanonicalStripeOperations>;
};

/**
 * Load exact local ownership and compare it with provider data supplied by an
 * authorized caller. This service never creates a Stripe client and never writes.
 */
export async function getCanonicalStripeShadowReadModel(input: {
  subscriptionId: string;
  observed: ObservedStripeSubscription | null;
  environment?: CanonicalStripeShadowEnvironment;
}): Promise<CanonicalStripeShadowReadModel> {
  assertCanonicalStripeShadowEnabled(input.environment);
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
    include: stripeShadowSubscriptionInclude,
  });
  if (!subscription) shadowError("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  if (subscription.controlMode === "legacy") {
    shadowError("LEGACY_SUBSCRIPTION_PROTECTED", "Legacy subscriptions are excluded from canonical Stripe shadow services.");
  }
  if (subscription.collectionMethod !== "stripe_autocharge") {
    shadowError("STRIPE_COLLECTION_REQUIRED", "Stripe shadow reconciliation requires Stripe autocharge collection.");
  }
  if (!subscription.nextBillingDate) {
    shadowError("NEXT_BILLING_DATE_REQUIRED", "Next billing date is required for Stripe shadow reconciliation.");
  }

  const openLinks = subscription.providerLinks.filter((link) => link.endedAt == null);
  if (openLinks.length > 1) {
    shadowError("PROVIDER_LINK_AMBIGUOUS", "More than one open Stripe relationship exists for this subscription.");
  }
  const activeLink = openLinks[0] ? providerLinkInput(openLinks[0]) : null;
  const observedOwner = input.observed
    ? await prisma.subscriptionProviderLink.findFirst({
        where: {
          provider: "stripe",
          externalSubscriptionId: input.observed.externalSubscriptionId,
        },
        select: { customerSubscriptionId: true },
      })
    : null;
  const expected = buildCanonicalStripeRateGroups(
    subscription,
    subscription.nextBillingDate,
    { requireActive: false },
  );
  const reconciliation = reconcileCanonicalStripeSubscription({
    expected,
    providerLink: activeLink,
    observed: input.observed,
    observedOwnerSubscriptionId: observedOwner?.customerSubscriptionId ?? null,
  });

  return {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    controlMode: subscription.controlMode,
    expectedRecurringTotal: expected.expectedRecurringTotal.toFixed(2),
    currency: expected.currency,
    billingIntervalMonths: expected.billingIntervalMonths,
    billingAnchorDate: expected.billingAnchorDate,
    nextBillingDate: expected.nextBillingDate,
    rateGroups: expected.groups.map((group) => ({
      fingerprint: group.fingerprint,
      agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
      quantity: group.quantity,
      recurringTotal: group.recurringTotal.toFixed(2),
      subscriptionItems: group.items,
    })),
    provider: {
      activeLinkId: activeLink?.id ?? null,
      externalSubscriptionId: activeLink?.externalSubscriptionId ?? null,
      providerStatus: activeLink?.providerStatus ?? null,
      historicalLinks: subscription.providerLinks
        .filter((link) => link.endedAt != null)
        .map((link) => ({
          id: link.id,
          externalSubscriptionId: link.externalSubscriptionId,
          providerStatus: link.providerStatus,
          activatedAt: link.activatedAt,
          endedAt: link.endedAt!,
        })),
    },
    reconciliation,
    operationPreview: planCanonicalStripeOperations({
      expected,
      providerLink: activeLink,
      observed: input.observed,
      reconciliation,
    }),
  };
}

export type CanonicalStripeInvoiceAttributionReadModel = Awaited<
  ReturnType<typeof planCanonicalStripeInvoiceAttribution>
> & {
  billingInvoiceId: string;
  existingNativeInvoiceId: string | null;
};

/**
 * Prepare service-level attribution for an already mirrored provider invoice.
 * Stable preview keys support future replay-safe persistence; this phase writes nothing.
 */
export async function getCanonicalStripeInvoiceAttributionPreview(input: {
  billingInvoiceId: string;
  externalSubscriptionId: string;
  lines: ObservedStripeInvoiceLine[];
  environment?: CanonicalStripeShadowEnvironment;
}): Promise<CanonicalStripeInvoiceAttributionReadModel> {
  assertCanonicalStripeShadowEnabled(input.environment);
  const billingInvoice = await prisma.billingInvoice.findUnique({
    where: { id: input.billingInvoiceId },
    include: {
      nativeMirror: { select: { id: true } },
      subscriptionProviderLink: {
        include: { providerItems: { orderBy: [{ rateGroupFingerprint: "asc" }, { id: "asc" }] } },
      },
      customerSubscription: {
        include: {
          items: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] } },
          },
        },
      },
    },
  });
  if (!billingInvoice) shadowError("BILLING_INVOICE_NOT_FOUND", "Provider invoice mirror not found.");
  if (billingInvoice.provider !== "stripe") {
    shadowError("STRIPE_INVOICE_REQUIRED", "Canonical Stripe attribution requires a Stripe invoice mirror.");
  }
  const subscription = billingInvoice.customerSubscription;
  const link = billingInvoice.subscriptionProviderLink;
  if (!subscription || !link) {
    shadowError("INVOICE_ATTRIBUTION_INCOMPLETE", "Exact subscription and provider-link attribution are required.");
  }
  if (subscription.controlMode === "legacy") {
    shadowError("LEGACY_SUBSCRIPTION_PROTECTED", "Legacy Stripe invoices are excluded from canonical attribution.");
  }
  if (
    link.customerSubscriptionId !== subscription.id
    || billingInvoice.customerId !== subscription.customerId
    || billingInvoice.externalInvoiceId.trim() === ""
  ) {
    shadowError("INVOICE_OWNERSHIP_CONFLICT", "Provider invoice ownership does not match the canonical subscription.");
  }
  if (!billingInvoice.periodStart || !billingInvoice.periodEnd) {
    shadowError("INVOICE_PERIOD_REQUIRED", "Provider invoice period boundaries are required for attribution.");
  }
  if (input.externalSubscriptionId !== link.externalSubscriptionId) {
    shadowError("PROVIDER_SUBSCRIPTION_MISMATCH", "Invoice provider subscription does not match its exact local relationship.");
  }

  const expected = buildCanonicalStripeRateGroups(
    subscription,
    billingInvoice.periodStart,
    { requireActive: false },
  );
  const preview = planCanonicalStripeInvoiceAttribution({
    externalInvoiceId: billingInvoice.externalInvoiceId,
    externalSubscriptionId: input.externalSubscriptionId,
    periodStart: billingInvoice.periodStart,
    periodEnd: billingInvoice.periodEnd,
    expected,
    providerLink: providerLinkInput(link),
    lines: input.lines,
  });
  return {
    ...preview,
    billingInvoiceId: billingInvoice.id,
    existingNativeInvoiceId: billingInvoice.nativeMirror?.id ?? null,
  };
}
