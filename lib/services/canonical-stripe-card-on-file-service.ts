import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import {
  CARD_ON_FILE_CHECKOUT_IDEMPOTENCY_VERSION,
  CARD_ON_FILE_PROVIDER_MODE,
  CanonicalStripeCardOnFileError,
  cardOnFileCheckoutBlockers,
  cardOnFileOperationKey,
  leftoverStripeStartFreshDecision,
  type LeftoverStripeInvoice,
  type LeftoverStripeSubscription,
} from "@/lib/domain/canonical-stripe-card-on-file";

export { CanonicalStripeCardOnFileError };
import { buildCanonicalStripeRateGroups } from "@/lib/domain/canonical-stripe-shadow";
import { assertLifecycleTransition } from "@/lib/domain/canonical-subscription-application";
import { matchExistingStripeProviderItems } from "@/lib/services/canonical-stripe-adoption-service";
import { syncCustomerBillingModeFromSubscriptions } from "@/lib/services/canonical-stripe-link-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import {
  cancelStripeSubscriptionImmediately,
  createCardOnFileCheckout,
  expireCheckoutSessionIfOpen,
  voidOpenStripeInvoice,
} from "@/lib/stripe/canonical-card-on-file-checkout";
import { normalizeCanonicalStripeSubscription } from "@/lib/stripe/canonical-provider-normalization";
import { isStripeBillingEnabled, getStripeClient } from "@/lib/stripe/config";
import { ensureStripeCustomerForTlCustomer } from "@/lib/stripe/customer";
import { resolveStripeCustomerIdForTlCustomer } from "@/lib/stripe/invoice-sync";

const configurationInclude = {
  customer: { select: { id: true, email: true, company: true, firstName: true, lastName: true, phone: true, stripeFeePassthrough: true } },
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }] as const,
    include: { rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] as const } },
  },
  providerLinks: { where: { provider: "stripe" as const }, select: { id: true, endedAt: true, externalSubscriptionId: true } },
  recurringSchedules: { where: { status: { in: ["active", "paused"] } }, select: { id: true, status: true } },
} satisfies Prisma.CustomerSubscriptionInclude;

type Configuration = Prisma.CustomerSubscriptionGetPayload<{ include: typeof configurationInclude }>;

type OperationMetadata = {
  kind: typeof CARD_ON_FILE_PROVIDER_MODE;
  previousCollectionMethod: "manual_invoice" | "stripe_autocharge" | null;
  previousLifecycleStatus: string | null;
  pausedScheduleIds: string[];
  nextBillingDate: string;
  canceledStripeSubscriptionIds: string[];
  voidedStripeInvoiceIds: string[];
};

function fail(code: string, message: string): never {
  throw new CanonicalStripeCardOnFileError(code, message);
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function requestFingerprint(input: { nextBillingDate: Date; recurringTotal: string; groupFingerprints: string[] }): string {
  return createHash("sha256").update(JSON.stringify({
    nextBillingDate: utcDay(input.nextBillingDate),
    recurringTotal: input.recurringTotal,
    groups: input.groupFingerprints,
  })).digest("hex");
}

function openStripeLink(configuration: Configuration) {
  return configuration.providerLinks.some((link) => link.endedAt == null);
}

function billableItemCount(configuration: Configuration): number {
  return configuration.items.filter((item) => !["ended", "canceled"].includes(item.status) && item.rates.length > 0).length;
}

async function loadConfiguration(subscriptionId: string): Promise<Configuration> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: configurationInclude,
  });
  if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  return subscription;
}

function localBlockers(configuration: Configuration): string[] {
  return cardOnFileCheckoutBlockers({
    controlMode: configuration.controlMode,
    lifecycleStatus: configuration.lifecycleStatus,
    collectionMethod: configuration.collectionMethod,
    billingIntervalMonths: configuration.billingIntervalMonths,
    nextBillingDate: configuration.nextBillingDate,
    billableItemCount: billableItemCount(configuration),
    hasOpenStripeLink: openStripeLink(configuration),
    customerEmail: configuration.customer.email,
    stripeBillingEnabled: isStripeBillingEnabled(),
  });
}

function plannedRateGroups(configuration: Configuration) {
  if (!configuration.nextBillingDate) fail("NEXT_BILLING_DATE_REQUIRED", "Next billing date is required.");
  return buildCanonicalStripeRateGroups(
    { ...configuration, collectionMethod: "stripe_autocharge" },
    configuration.nextBillingDate,
    { requireActive: false },
  );
}

async function listLeftoverStripe(thisSubscriptionId: string, stripeCustomerId: string | null): Promise<{
  subscriptions: LeftoverStripeSubscription[];
  openInvoices: LeftoverStripeInvoice[];
}> {
  if (!stripeCustomerId) return { subscriptions: [], openInvoices: [] };
  const stripe = getStripeClient();
  const [listed, open, uncollectible] = await Promise.all([
    stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 100 }),
    stripe.invoices.list({ customer: stripeCustomerId, status: "open", limit: 100 }),
    stripe.invoices.list({ customer: stripeCustomerId, status: "uncollectible", limit: 100 }),
  ]);
  const externalIds = listed.data.map((entry) => entry.id);
  const links = externalIds.length
    ? await prisma.subscriptionProviderLink.findMany({
        where: { provider: "stripe", externalSubscriptionId: { in: externalIds }, endedAt: null },
        select: { externalSubscriptionId: true, customerSubscriptionId: true },
      })
    : [];
  const ownerByExternalId = new Map(links.map((link) => [link.externalSubscriptionId, link.customerSubscriptionId]));
  return {
    subscriptions: listed.data.map((entry) => {
      const owner = ownerByExternalId.get(entry.id) ?? null;
      return {
        id: entry.id,
        status: entry.status,
        currentPeriodEnd: entry.current_period_end ? new Date(entry.current_period_end * 1000).toISOString().slice(0, 10) : null,
        linkedSubscriptionId: owner && owner !== thisSubscriptionId ? owner : null,
      };
    }),
    openInvoices: [...open.data, ...uncollectible.data].map((invoice) => ({
      id: invoice.id,
      status: invoice.status ?? "unknown",
      amountDue: new Prisma.Decimal(invoice.amount_due ?? 0).dividedBy(100).toFixed(2),
      currency: (invoice.currency ?? "xcd").toUpperCase(),
    })),
  };
}

export type CardOnFilePanelState = {
  blockers: string[];
  firstChargeDate: string | null;
  recurringTotal: string | null;
  currency: string | null;
  leftoverSummary: string | null;
  requiresExplicitCancel: boolean;
  liveSubscriptions: LeftoverStripeSubscription[];
  canceledSubscriptions: LeftoverStripeSubscription[];
  collectibleInvoices: LeftoverStripeInvoice[];
  checkout: { id: string; url: string | null; status: string } | null;
  checkoutFailure: string | null;
};

export async function inspectStripeCardOnFileReadiness(subscriptionId: string): Promise<CardOnFilePanelState> {
  const configuration = await loadConfiguration(subscriptionId);
  const blockers = localBlockers(configuration);
  const empty: CardOnFilePanelState = {
    blockers,
    firstChargeDate: configuration.nextBillingDate ? utcDay(configuration.nextBillingDate) : null,
    recurringTotal: null,
    currency: configuration.currency,
    leftoverSummary: null,
    requiresExplicitCancel: false,
    liveSubscriptions: [],
    canceledSubscriptions: [],
    collectibleInvoices: [],
    checkout: null,
    checkoutFailure: null,
  };
  if (blockers.length) return empty;

  let recurringTotal: string | null = null;
  try {
    recurringTotal = plannedRateGroups(configuration).expectedRecurringTotal.toFixed(2);
  } catch (error) {
    return { ...empty, blockers: [error instanceof Error ? error.message : "The recurring amount could not be planned."] };
  }

  const operation = await prisma.billingOperation.findUnique({
    where: { operationKey: cardOnFileOperationKey(subscriptionId) },
    select: { status: true, providerReference: true, failureMessage: true },
  });
  let checkout: CardOnFilePanelState["checkout"] = null;
  if (operation?.providerReference && ["pending", "in_progress", "retry_required"].includes(operation.status)) {
    try {
      const session = await getStripeClient().checkout.sessions.retrieve(operation.providerReference);
      checkout = { id: session.id, url: session.url, status: session.status ?? operation.status };
    } catch {
      checkout = { id: operation.providerReference, url: null, status: operation.status };
    }
  }

  const stripeCustomerId = await resolveStripeCustomerIdForTlCustomer(configuration.customerId);
  const leftover = leftoverStripeStartFreshDecision(await listLeftoverStripe(configuration.id, stripeCustomerId));
  if (leftover.foreignBlocker) {
    return { ...empty, recurringTotal, leftoverSummary: leftover.foreignBlocker, blockers: [leftover.foreignBlocker] };
  }

  return {
    blockers: [],
    firstChargeDate: utcDay(configuration.nextBillingDate!),
    recurringTotal,
    currency: configuration.currency,
    leftoverSummary: leftover.summary,
    requiresExplicitCancel: leftover.requiresExplicitCancel,
    liveSubscriptions: leftover.liveSubscriptions,
    canceledSubscriptions: leftover.canceledSubscriptions,
    collectibleInvoices: leftover.collectibleInvoices,
    checkout: checkout?.status === "open" ? checkout : null,
    checkoutFailure: operation?.failureMessage ?? null,
  };
}

export async function startStripeCardOnFileCheckout(input: {
  subscriptionId: string;
  staffUserId: string;
  confirmCancelExisting: boolean;
}): Promise<{ checkoutUrl: string; reused: boolean; canceledCount: number; voidedCount: number }> {
  const configuration = await loadConfiguration(input.subscriptionId);
  const blockers = localBlockers(configuration);
  if (blockers.length) fail("NOT_ELIGIBLE", blockers.join(" "));

  const planned = plannedRateGroups(configuration);
  const groups = planned.groups.map((group) => ({
    fingerprint: group.fingerprint,
    currency: group.currency,
    billingIntervalMonths: group.billingIntervalMonths,
    agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
    quantity: group.quantity,
  }));
  const fingerprint = requestFingerprint({
    nextBillingDate: configuration.nextBillingDate!,
    recurringTotal: planned.expectedRecurringTotal.toFixed(2),
    groupFingerprints: groups.map((group) => `${group.fingerprint}:${group.quantity}`),
  });

  const customer = await prisma.customer.findUnique({ where: { id: configuration.customerId } });
  if (!customer) fail("SUBSCRIPTION_NOT_FOUND", "Customer not found.");
  const stripeCustomerId = (await ensureStripeCustomerForTlCustomer(customer)).stripeCustomerId;
  const leftover = leftoverStripeStartFreshDecision(await listLeftoverStripe(configuration.id, stripeCustomerId));
  if (leftover.foreignBlocker) fail("FOREIGN_STRIPE_SUBSCRIPTION", leftover.foreignBlocker);
  if (leftover.requiresExplicitCancel && !input.confirmCancelExisting) {
    fail("CONFIRM_CANCEL_REQUIRED", leftover.summary);
  }

  const canceledStripeSubscriptionIds: string[] = [];
  const voidedStripeInvoiceIds: string[] = [];
  if (leftover.requiresExplicitCancel) {
    for (const subscription of leftover.liveSubscriptions) {
      await cancelStripeSubscriptionImmediately(subscription.id);
      canceledStripeSubscriptionIds.push(subscription.id);
    }
    for (const invoice of leftover.collectibleInvoices) {
      await voidOpenStripeInvoice(invoice.id);
      voidedStripeInvoiceIds.push(invoice.id);
    }
  }

  const operationKey = cardOnFileOperationKey(configuration.id);
  const existing = await prisma.billingOperation.findUnique({ where: { operationKey } });
  if (existing?.providerReference && existing.requestFingerprint === fingerprint && ["pending", "in_progress"].includes(existing.status)) {
    const session = await getStripeClient().checkout.sessions.retrieve(existing.providerReference);
    if (session.status === "open" && session.url) {
      return { checkoutUrl: session.url, reused: true, canceledCount: canceledStripeSubscriptionIds.length, voidedCount: voidedStripeInvoiceIds.length };
    }
  }
  if (existing?.providerReference && existing.status !== "completed") {
    try { await expireCheckoutSessionIfOpen(existing.providerReference); } catch { /* replaced below */ }
  }

  const pausedScheduleIds = configuration.recurringSchedules.filter((schedule) => schedule.status === "active").map((schedule) => schedule.id);
  const metadata: OperationMetadata = {
    kind: CARD_ON_FILE_PROVIDER_MODE,
    previousCollectionMethod: configuration.collectionMethod,
    previousLifecycleStatus: configuration.lifecycleStatus,
    pausedScheduleIds,
    nextBillingDate: utcDay(configuration.nextBillingDate!),
    canceledStripeSubscriptionIds,
    voidedStripeInvoiceIds,
  };

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${configuration.id} FOR UPDATE`;
    const current = await tx.customerSubscription.findUnique({
      where: { id: configuration.id },
      select: { lifecycleStatus: true, collectionMethod: true, providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } } },
    });
    if (!current || current.providerLinks.length > 0) fail("STATE_CHANGED", "This subscription changed before Checkout was recorded. Reload and try again.");

    if (pausedScheduleIds.length) {
      await tx.recurringInvoiceSchedule.updateMany({
        where: { id: { in: pausedScheduleIds } },
        data: { status: "paused" },
      });
    }
    const nextLifecycle = current.lifecycleStatus === "draft" ? "pending_activation" as const : current.lifecycleStatus;
    if (nextLifecycle && nextLifecycle !== current.lifecycleStatus) {
      assertLifecycleTransition(current.lifecycleStatus ?? "draft", nextLifecycle);
    }
    await tx.customerSubscription.update({
      where: { id: configuration.id },
      data: {
        collectionMethod: "stripe_autocharge",
        lifecycleStatus: nextLifecycle,
      },
    });
    await tx.billingOperation.upsert({
      where: { operationKey },
      create: {
        type: "stripe_checkout_activation",
        status: "pending",
        customerId: configuration.customerId,
        customerSubscriptionId: configuration.id,
        operationKey,
        activeKey: operationKey,
        requestFingerprint: fingerprint,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        metadata,
      },
      update: {
        status: "pending",
        activeKey: operationKey,
        requestFingerprint: fingerprint,
        providerSubscriptionReference: null,
        failureCode: null,
        failureMessage: null,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        metadata,
      },
    });
  });

  let checkout: { id: string; url: string; status: string };
  try {
    checkout = await createCardOnFileCheckout({
      stripeCustomerId,
      operationKey,
      subscriptionId: configuration.id,
      customerId: configuration.customerId,
      nextBillingDate: configuration.nextBillingDate!,
      groups,
      idempotencyKey: `tl-card-on-file-checkout:${CARD_ON_FILE_CHECKOUT_IDEMPOTENCY_VERSION}:${fingerprint}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe could not create Checkout.";
    await prisma.billingOperation.update({
      where: { operationKey },
      data: {
        status: "failed",
        failureCode: "CHECKOUT_CREATE_FAILED",
        failureMessage: message,
        activeKey: null,
      },
    });
    fail("CHECKOUT_CREATE_FAILED", message);
  }
  await prisma.billingOperation.update({
    where: { operationKey },
    data: { providerReference: checkout.id, status: "in_progress" },
  });

  await recordOperationalEvent({
    category: "subscription.card_on_file_checkout_created",
    summary: leftover.requiresExplicitCancel
      ? "Previous Stripe arrangement closed; card-on-file Checkout sent with first charge on the renewal date."
      : "Card-on-file Checkout sent with first charge on the renewal date.",
    customerId: configuration.customerId,
    actorUserId: input.staffUserId,
    payload: {
      subscriptionId: configuration.id,
      checkoutSessionId: checkout.id,
      firstChargeDate: utcDay(configuration.nextBillingDate!),
      canceledStripeSubscriptionIds,
      voidedStripeInvoiceIds,
    },
  });

  return {
    checkoutUrl: checkout.url,
    reused: false,
    canceledCount: canceledStripeSubscriptionIds.length,
    voidedCount: voidedStripeInvoiceIds.length,
  };
}

export async function completeCardOnFileCheckout(input: {
  operationKey: string;
  checkoutSessionId: string;
  stripeSubscription: Stripe.Subscription;
}): Promise<{ alreadyComplete: boolean; subscriptionId: string }> {
  const operation = await prisma.billingOperation.findUnique({ where: { operationKey: input.operationKey } });
  if (!operation || operation.type !== "stripe_checkout_activation" || !isCardOnFileMetadata(operation.metadata)) {
    fail("OPERATION_NOT_FOUND", "This Checkout is not a card-on-file activation.");
  }
  if (operation.status === "completed") {
    return { alreadyComplete: true, subscriptionId: operation.customerSubscriptionId ?? "" };
  }
  const subscriptionId = operation.customerSubscriptionId;
  if (!subscriptionId) fail("OPERATION_NOT_FOUND", "The Checkout is missing its subscription.");

  const configuration = await loadConfiguration(subscriptionId);
  const planned = plannedRateGroups(configuration);
  const observed = normalizeCanonicalStripeSubscription(input.stripeSubscription);
  const mappings = matchExistingStripeProviderItems(planned, observed.subscription.items);
  const observedStatus = observed.subscription.status ?? input.stripeSubscription.status;
  const stripeCustomerId = typeof input.stripeSubscription.customer === "string"
    ? input.stripeSubscription.customer
    : input.stripeSubscription.customer.id;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
    const current = await tx.customerSubscription.findUnique({
      where: { id: subscriptionId },
      select: {
        lifecycleStatus: true,
        providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } },
        items: { where: { status: { notIn: ["ended", "canceled"] } }, select: { id: true, status: true, serviceActivatedDate: true, billingEffectiveFrom: true } },
      },
    });
    if (!current) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
    if (current.providerLinks.length === 0) {
      await tx.subscriptionProviderLink.create({
        data: {
          customerSubscriptionId: subscriptionId,
          provider: "stripe",
          externalSubscriptionId: input.stripeSubscription.id,
          providerStatus: observedStatus,
          lastSyncedAt: new Date(),
          providerItems: { create: mappings },
        },
      });
    }
    if (current.lifecycleStatus === "draft" || current.lifecycleStatus === "pending_activation") {
      if (current.lifecycleStatus === "draft") assertLifecycleTransition("draft", "pending_activation");
      assertLifecycleTransition(current.lifecycleStatus === "draft" ? "pending_activation" : current.lifecycleStatus, "active");
    }
    await tx.customerSubscription.update({
      where: { id: subscriptionId },
      data: {
        collectionMethod: "stripe_autocharge",
        lifecycleStatus: "active",
        collectionHealth: ["past_due", "unpaid"].includes(observedStatus) ? "past_due" : "current",
      },
    });
    const now = new Date();
    for (const item of current.items) {
      await tx.subscriptionItem.update({
        where: { id: item.id },
        data: {
          status: "active",
          serviceActivatedDate: item.serviceActivatedDate ?? now,
          billingEffectiveFrom: item.billingEffectiveFrom ?? now,
        },
      });
    }
    await tx.recurringInvoiceSchedule.updateMany({
      where: { customerSubscriptionId: subscriptionId, status: { in: ["active", "paused"] } },
      data: { status: "ended" },
    });
    await tx.billingAccount.upsert({
      where: { customerId_provider: { customerId: configuration.customerId, provider: "stripe" } },
      create: { customerId: configuration.customerId, provider: "stripe", externalCustomerId: stripeCustomerId, mode: "stripe_subscription", status: observedStatus },
      update: { externalCustomerId: stripeCustomerId, mode: "stripe_subscription", status: observedStatus },
    });
    await tx.billingOperation.update({
      where: { id: operation.id },
      data: {
        status: "completed",
        activeKey: null,
        providerReference: input.checkoutSessionId || operation.providerReference,
        providerSubscriptionReference: input.stripeSubscription.id,
        completedAt: now,
        failureCode: null,
        failureMessage: null,
      },
    });
    await syncCustomerBillingModeFromSubscriptions(configuration.customerId, tx);
  });

  await recordOperationalEvent({
    category: "subscription.card_on_file_completed",
    summary: "Customer saved a card. Stripe will charge on the renewal date.",
    customerId: configuration.customerId,
    payload: {
      subscriptionId,
      checkoutSessionId: input.checkoutSessionId,
      stripeSubscriptionId: input.stripeSubscription.id,
      firstChargeDate: utcDay(configuration.nextBillingDate!),
    },
  });

  return { alreadyComplete: false, subscriptionId };
}

export async function expireCardOnFileCheckout(input: {
  operationKey: string;
  checkoutSessionId: string;
}): Promise<void> {
  const operation = await prisma.billingOperation.findUnique({ where: { operationKey: input.operationKey } });
  if (!operation || operation.type !== "stripe_checkout_activation" || !isCardOnFileMetadata(operation.metadata)) return;
  if (operation.status === "completed") return;
  const metadata = operation.metadata as OperationMetadata;
  await prisma.$transaction(async (tx) => {
    await tx.billingOperation.update({
      where: { id: operation.id },
      data: {
        status: "failed",
        activeKey: null,
        failureCode: "SESSION_EXPIRED",
        failureMessage: "The customer did not finish Checkout before the link expired.",
        providerReference: input.checkoutSessionId,
      },
    });
    if (!operation.customerSubscriptionId) return;
    const linked = await tx.subscriptionProviderLink.findFirst({
      where: { customerSubscriptionId: operation.customerSubscriptionId, provider: "stripe", endedAt: null },
      select: { id: true },
    });
    if (linked) return;
    if (metadata.pausedScheduleIds.length) {
      await tx.recurringInvoiceSchedule.updateMany({
        where: { id: { in: metadata.pausedScheduleIds }, status: "paused" },
        data: { status: "active" },
      });
    }
    await tx.customerSubscription.update({
      where: { id: operation.customerSubscriptionId },
      data: {
        collectionMethod: metadata.previousCollectionMethod ?? "manual_invoice",
        lifecycleStatus: metadata.previousLifecycleStatus === "draft" || metadata.previousLifecycleStatus === "pending_activation" || metadata.previousLifecycleStatus === "active"
          ? metadata.previousLifecycleStatus
          : undefined,
      },
    });
  });
}

function isCardOnFileMetadata(value: Prisma.JsonValue | null): value is OperationMetadata {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { kind?: unknown }).kind === CARD_ON_FILE_PROVIDER_MODE);
}

export function cardOnFileMetadataFromStripe(metadata: Stripe.Metadata | null | undefined): {
  operationKey: string | null;
  subscriptionId: string | null;
  customerId: string | null;
} {
  return {
    operationKey: metadata?.tl_card_on_file_operation_key?.trim() || null,
    subscriptionId: metadata?.tl_canonical_subscription_id?.trim() || null,
    customerId: metadata?.tl_customer_id?.trim() || null,
  };
}
