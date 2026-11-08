import "server-only";

import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import {
  buildCanonicalStripeRateGroups,
  reconcileCanonicalStripeSubscription,
  type LocalStripeProviderLink,
} from "@/lib/domain/canonical-stripe-shadow";
import { deriveCustomerBillingMode, stripeLinkBlockers } from "@/lib/domain/canonical-stripe-link";
import { matchExistingStripeProviderItems, type ExistingStripeProviderMapping } from "@/lib/services/canonical-stripe-adoption-service";
import { normalizeCanonicalStripeSubscription } from "@/lib/stripe/canonical-provider-normalization";
import { getStripeClient, isStripeBillingEnabled } from "@/lib/stripe/config";
import { resolveStripeCustomerIdForTlCustomer } from "@/lib/stripe/invoice-sync";

/**
 * Move an ACTIVE canonical subscription from Recurring invoices to Stripe card billing by
 * LINKING a Stripe subscription that already exists. Nothing is created or changed in
 * Stripe: the Stripe subscription is only read, then compared with this subscription's
 * services, rates, quantity and exact renewal boundaries (the same reconciliation used
 * for adoption). Anything that does not match exactly is refused with a reason.
 */

export class CanonicalStripeLinkError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeLinkError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new CanonicalStripeLinkError(code, message);
}

const LIVE_STRIPE_STATUSES = ["active", "trialing", "past_due", "unpaid"];

export type LinkableStripeSubscription = {
  id: string;
  status: string;
  /** e.g. "3 × XCD 25.00 / 1 mo" */
  summary: string;
  currentPeriodEnd: string | null;
  eligible: boolean;
  /** Why it cannot be linked (empty when eligible). */
  issues: string[];
};

export type LinkableStripeResult = {
  blockers: string[];
  stripeCustomerId: string | null;
  candidates: LinkableStripeSubscription[];
};

async function loadConfiguration(subscriptionId: string) {
  return prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      items: { include: { rates: true } },
      providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } },
    },
  });
}
type Configuration = NonNullable<Awaited<ReturnType<typeof loadConfiguration>>>;

function blockersFor(configuration: Configuration): string[] {
  const blockers = stripeLinkBlockers({
    controlMode: configuration.controlMode,
    lifecycleStatus: configuration.lifecycleStatus,
    collectionMethod: configuration.collectionMethod,
    billingIntervalMonths: configuration.billingIntervalMonths,
    billingAnchorDate: configuration.billingAnchorDate,
    nextBillingDate: configuration.nextBillingDate,
    billableItemCount: configuration.items.filter((item) => !["ended", "canceled"].includes(item.status) && item.rates.length > 0).length,
    hasOpenStripeLink: configuration.providerLinks.length > 0,
  });
  return blockers;
}

/** An invoice already issued for the period Stripe would charge next would be billed twice. */
async function upcomingPeriodInvoiceBlocker(configuration: Configuration): Promise<string | null> {
  if (!configuration.nextBillingDate) return null;
  const existing = await prisma.invoice.findFirst({
    where: {
      customerSubscriptionId: configuration.id,
      status: { notIn: ["void", "written_off"] },
      recurringPeriodStart: { gte: configuration.nextBillingDate },
    },
    select: { number: true },
  });
  return existing
    ? `Invoice ${existing.number ?? ""} already exists for the period starting on or after the next renewal, so Stripe would charge it twice. Void it first.`.replace("  ", " ")
    : null;
}

function describeObservedItems(observed: ReturnType<typeof normalizeCanonicalStripeSubscription>["subscription"]): string {
  const parts = observed.items.map((item) => `${item.quantity ?? "?"} × ${item.currency ?? ""} ${item.unitAmount == null ? "?" : String(item.unitAmount)} / ${item.billingIntervalMonths ?? "?"} mo`.replace("  ", " "));
  return parts.join(" + ") || "no recurring items";
}

type Evaluation = {
  ok: boolean;
  issues: string[];
  mappings: ExistingStripeProviderMapping[];
  observed: ReturnType<typeof normalizeCanonicalStripeSubscription>["subscription"];
};

/** Read-only comparison of one Stripe subscription with this canonical subscription. */
async function evaluateStripeSubscription(configuration: Configuration, stripeSubscription: Stripe.Subscription): Promise<Evaluation> {
  const observed = normalizeCanonicalStripeSubscription(stripeSubscription).subscription;
  const issues: string[] = [];

  if (!LIVE_STRIPE_STATUSES.includes(stripeSubscription.status)) {
    return { ok: false, issues: [`The Stripe subscription is ${stripeSubscription.status}, not active.`], mappings: [], observed };
  }
  if (stripeSubscription.cancel_at_period_end) {
    issues.push("The Stripe subscription is set to cancel at period end.");
  }

  const owner = await prisma.subscriptionProviderLink.findUnique({
    where: { provider_externalSubscriptionId: { provider: "stripe", externalSubscriptionId: stripeSubscription.id } },
    select: { customerSubscriptionId: true },
  });
  if (owner) {
    issues.push(owner.customerSubscriptionId === configuration.id
      ? "This Stripe subscription was previously linked to this subscription and cannot be linked again here."
      : "This Stripe subscription is already linked to another subscription.");
    return { ok: false, issues, mappings: [], observed };
  }

  let mappings: ExistingStripeProviderMapping[] = [];
  try {
    // Plan against the TARGET state (Stripe collection) without changing anything yet.
    const expected = buildCanonicalStripeRateGroups(
      { ...configuration, collectionMethod: "stripe_autocharge" },
      configuration.nextBillingDate!,
      { requireActive: false },
    );
    mappings = matchExistingStripeProviderItems(expected, observed.items);
    const localLink: LocalStripeProviderLink = {
      id: "pending",
      customerSubscriptionId: configuration.id,
      provider: "stripe",
      externalSubscriptionId: stripeSubscription.id,
      providerStatus: observed.status,
      endedAt: null,
      providerItems: mappings.map((item) => ({ id: "pending", subscriptionProviderLinkId: "pending", ...item })),
    };
    const reconciliation = reconcileCanonicalStripeSubscription({ expected, providerLink: localLink, observed });
    if (reconciliation.status !== "matched") {
      issues.push(...reconciliation.issues.map((entry) => entry.explanation));
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "The Stripe subscription could not be compared.");
  }
  return { ok: issues.length === 0, issues, mappings, observed };
}

/** Stripe subscriptions for this customer that could be linked, each with an exact-match verdict. Read-only. */
export async function findLinkableStripeSubscriptions(subscriptionId: string): Promise<LinkableStripeResult> {
  if (!isStripeBillingEnabled()) {
    return { blockers: ["Stripe billing is not enabled in this environment."], stripeCustomerId: null, candidates: [] };
  }
  const configuration = await loadConfiguration(subscriptionId);
  if (!configuration) return { blockers: ["Subscription not found."], stripeCustomerId: null, candidates: [] };
  const blockers = blockersFor(configuration);
  const invoiceBlocker = await upcomingPeriodInvoiceBlocker(configuration);
  if (invoiceBlocker) blockers.push(invoiceBlocker);
  if (blockers.length) return { blockers, stripeCustomerId: null, candidates: [] };

  const stripeCustomerId = await resolveStripeCustomerIdForTlCustomer(configuration.customerId);
  if (!stripeCustomerId) {
    return {
      blockers: ["No Stripe customer is linked to this customer yet. Paste the Stripe subscription ID instead."],
      stripeCustomerId: null,
      candidates: [],
    };
  }

  const stripe = getStripeClient();
  const listed = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 20 });
  const live = listed.data.filter((entry) => LIVE_STRIPE_STATUSES.includes(entry.status));
  const candidates: LinkableStripeSubscription[] = [];
  for (const entry of live) {
    const evaluation = await evaluateStripeSubscription(configuration, entry);
    candidates.push({
      id: entry.id,
      status: entry.status,
      summary: describeObservedItems(evaluation.observed),
      currentPeriodEnd: evaluation.observed.currentPeriodEnd?.toISOString().slice(0, 10) ?? null,
      eligible: evaluation.ok,
      issues: evaluation.issues,
    });
  }
  return { blockers: [], stripeCustomerId, candidates };
}

/** Customer flag follows the subscriptions. Untouched for customers with no workspace subscriptions. */
export async function syncCustomerBillingModeFromSubscriptions(
  customerId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ changed: boolean; from: string | null; to: string | null }> {
  const subscriptions = await client.customerSubscription.findMany({
    where: { customerId, controlMode: "canonical", lifecycleStatus: { in: ["active", "paused", "pending_activation"] } },
    select: { collectionMethod: true },
  });
  if (subscriptions.length === 0) return { changed: false, from: null, to: null };
  const customer = await client.customer.findUnique({ where: { id: customerId }, select: { billingMode: true } });
  if (!customer) return { changed: false, from: null, to: null };
  const to = deriveCustomerBillingMode(subscriptions.map((entry) => entry.collectionMethod));
  if (customer.billingMode === to) return { changed: false, from: customer.billingMode, to };
  await client.customer.update({ where: { id: customerId }, data: { billingMode: to } });
  return { changed: true, from: customer.billingMode, to };
}

export type LinkExistingStripeResult = {
  externalSubscriptionId: string;
  mappingCount: number;
  nextBillingDate: Date;
  schedulesEnded: number;
  billingModeChanged: boolean;
};

export async function linkExistingStripeSubscription(input: {
  subscriptionId: string;
  externalSubscriptionId: string;
}): Promise<LinkExistingStripeResult> {
  if (!isStripeBillingEnabled()) fail("STRIPE_DISABLED", "Stripe billing is not enabled in this environment.");
  const externalSubscriptionId = input.externalSubscriptionId.trim();
  if (!/^sub_[A-Za-z0-9]+$/.test(externalSubscriptionId)) fail("INVALID_STRIPE_SUBSCRIPTION", "Enter a Stripe subscription ID that starts with sub_.");

  const configuration = await loadConfiguration(input.subscriptionId);
  if (!configuration) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  const blockers = blockersFor(configuration);
  const invoiceBlocker = await upcomingPeriodInvoiceBlocker(configuration);
  if (invoiceBlocker) blockers.push(invoiceBlocker);
  if (blockers.length) fail("NOT_ELIGIBLE", blockers.join(" "));

  const stripeSubscription = await getStripeClient().subscriptions.retrieve(externalSubscriptionId, { expand: ["items.data.price"] });
  if (process.env.NODE_ENV === "production" && stripeSubscription.livemode !== true) {
    fail("LIVE_STRIPE_REQUIRED", "Production linking requires a live Stripe subscription.");
  }

  // The Stripe subscription must belong to this customer's Stripe account (or establish it).
  const stripeCustomerId = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : stripeSubscription.customer.id;
  const knownStripeCustomerId = await resolveStripeCustomerIdForTlCustomer(configuration.customerId);
  if (knownStripeCustomerId && knownStripeCustomerId !== stripeCustomerId) {
    fail("STRIPE_CUSTOMER_MISMATCH", "That Stripe subscription belongs to a different Stripe customer than the one linked to this customer.");
  }
  const taggedCustomerId = stripeSubscription.metadata?.tl_customer_id?.trim();
  if (taggedCustomerId && taggedCustomerId !== configuration.customerId) {
    fail("STRIPE_CUSTOMER_MISMATCH", "That Stripe subscription is tagged to a different customer in TL Portal.");
  }

  const evaluation = await evaluateStripeSubscription(configuration, stripeSubscription);
  if (!evaluation.ok) fail("STRIPE_RECONCILIATION_FAILED", evaluation.issues.join(" "));
  const observedStatus = evaluation.observed.status ?? stripeSubscription.status;

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${configuration.id} FOR UPDATE`;
    const current = await tx.customerSubscription.findUnique({
      where: { id: configuration.id },
      select: { controlMode: true, lifecycleStatus: true, collectionMethod: true, providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } } },
    });
    if (!current || current.controlMode !== "canonical" || current.lifecycleStatus !== "active" || current.collectionMethod !== "manual_invoice" || current.providerLinks.length > 0) {
      fail("STATE_CHANGED", "This subscription changed before the Stripe link completed. Reload and try again.");
    }

    await tx.subscriptionProviderLink.create({
      data: {
        customerSubscriptionId: configuration.id,
        provider: "stripe",
        externalSubscriptionId,
        providerStatus: observedStatus,
        lastSyncedAt: new Date(),
        providerItems: { create: evaluation.mappings },
      },
    });
    await tx.customerSubscription.update({
      where: { id: configuration.id },
      data: {
        collectionMethod: "stripe_autocharge",
        collectionHealth: ["past_due", "unpaid"].includes(observedStatus) ? "past_due" : "current",
      },
    });
    // Stripe collects from now on. Recurring native invoices for the same obligation must stop.
    const ended = await tx.recurringInvoiceSchedule.updateMany({
      where: { customerSubscriptionId: configuration.id, status: { in: ["active", "paused"] } },
      data: { status: "ended" },
    });
    await tx.billingAccount.upsert({
      where: { customerId_provider: { customerId: configuration.customerId, provider: "stripe" } },
      create: { customerId: configuration.customerId, provider: "stripe", externalCustomerId: stripeCustomerId, mode: "stripe_subscription", status: observedStatus },
      update: { externalCustomerId: stripeCustomerId, mode: "stripe_subscription", status: observedStatus },
    });
    const mode = await syncCustomerBillingModeFromSubscriptions(configuration.customerId, tx);
    return { schedulesEnded: ended.count, billingModeChanged: mode.changed };
  });

  return {
    externalSubscriptionId,
    mappingCount: evaluation.mappings.length,
    nextBillingDate: configuration.nextBillingDate!,
    schedulesEnded: outcome.schedulesEnded,
    billingModeChanged: outcome.billingModeChanged,
  };
}
