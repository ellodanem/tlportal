import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalStripeLiveCanaryAuthorization,
  assertCanonicalStripeLiveCanaryEnvironment,
  buildSignedCanonicalStripeLiveCanaryAuthorization,
  liveCanaryMaxRecurringAmount,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "@/lib/domain/canonical-stripe-live-canary";
import {
  approveCanonicalStripeOperation,
  executeCanonicalStripeActivation,
  getCanonicalStripeExecutionProposal,
  getCanonicalStripeLiveCanaryUnsignedProposal,
} from "@/lib/services/canonical-stripe-execution-service";
import {
  convertSubscriptionToStripeCollectionForCanary,
  revertCanaryCollectionToRecurringInvoices,
} from "@/lib/services/canonical-stripe-canary-collection-service";
import {
  createStripeLiveCanaryCanonicalProviderAdapter,
  type StripeLiveCanaryCanonicalProviderAdapter,
} from "@/lib/stripe/canonical-live-canary-provider";

function storedCanonicalProposal(metadata: Prisma.JsonValue | null) {
  const object = metadata as Prisma.JsonObject | null;
  const stored = object?.proposal as Prisma.JsonObject | undefined;
  if (!stored) throw new Error("The canary operation lacks its immutable approved proposal.");
  return {
    ...(stored as unknown as Parameters<typeof assertCanonicalStripeLiveCanaryAuthorization>[0]["proposal"]),
    billingAnchorDate: new Date(String(stored.billingAnchorDate)),
    nextBillingDate: new Date(String(stored.nextBillingDate)),
  };
}

export type LiveCanaryPanelState =
  | { visible: false }
  | {
    visible: true;
    environmentIssue: string | null;
    collectionMethod: string | null;
    preview: { currency: string; amount: string; renewsOn: string; groups: string[]; cap: string } | null;
    previewIssue: string | null;
    operation: { status: string; failureMessage: string | null } | null;
    checkout: { url: string | null; status: string } | null;
    checkoutIssue: string | null;
    linked: { externalSubscriptionId: string; providerStatus: string | null } | null;
    openSchedules: number;
    /** Switched to Stripe collection but nothing approved yet (a half-finished attempt). */
    converted: boolean;
  };

/**
 * What the owner-only screen shows for ONE subscription. Invisible to everyone but the
 * configured owner, and for any subscription other than the allowlisted one.
 */
export async function getCanonicalStripeLiveCanaryPanelState(input: {
  subscriptionId: string;
  actorEmail: string | null;
  environment?: CanonicalStripeLiveCanaryEnvironment;
}): Promise<LiveCanaryPanelState> {
  const environment = input.environment ?? process.env;
  const allowedSubscription = environment.CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID?.trim();
  const owner = environment.CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL?.trim().toLowerCase();
  if (
    !allowedSubscription || allowedSubscription !== input.subscriptionId
    || !owner || !input.actorEmail || input.actorEmail.trim().toLowerCase() !== owner
  ) return { visible: false };

  let environmentIssue: string | null = null;
  try {
    assertCanonicalStripeLiveCanaryEnvironment(environment);
  } catch (caught) {
    environmentIssue = caught instanceof Error ? caught.message : "Canary settings are incomplete.";
  }

  const status = await getCanonicalStripeLiveCanaryStatus(input.subscriptionId);
  const operation = status.billingOperations[0] ?? null;
  const link = status.providerLinks[0] ?? null;
  const openSchedules = await prisma.recurringInvoiceSchedule.count({
    where: { customerSubscriptionId: input.subscriptionId, status: { in: ["active", "paused"] } },
  });

  let preview: Extract<LiveCanaryPanelState, { visible: true }>["preview"] = null;
  let previewIssue: string | null = null;
  if (!operation && !link) {
    try {
      const proposal = await getCanonicalStripeLiveCanaryUnsignedProposal(input.subscriptionId, { previewAsStripeCollection: true });
      preview = {
        currency: proposal.currency,
        amount: proposal.expectedRecurringTotal,
        renewsOn: proposal.nextBillingDate.toISOString().slice(0, 10),
        groups: proposal.rateGroups.map((group) => `${group.quantity} × ${group.agreedAmountPerCycle}`),
        cap: liveCanaryMaxRecurringAmount(environment),
      };
    } catch (caught) {
      previewIssue = caught instanceof Error ? caught.message : "The proposal could not be built.";
    }
  }

  let checkout: Extract<LiveCanaryPanelState, { visible: true }>["checkout"] = null;
  let checkoutIssue: string | null = null;
  if (operation?.providerReference && !link && !environmentIssue) {
    try {
      const row = await prisma.billingOperation.findUnique({ where: { id: operation.id }, select: { metadata: true, operationKey: true } });
      const stored = (row?.metadata as Prisma.JsonObject | null)?.liveCanaryAuthorization as unknown as CanonicalStripeLiveCanaryAuthorization | undefined;
      if (row && stored) {
        const adapter = createStripeLiveCanaryCanonicalProviderAdapter({
          authorization: stored,
          proposal: storedCanonicalProposal(row.metadata),
          environment,
        });
        const session = await adapter.retrieveCheckoutSession(operation.providerReference, row.operationKey, input.subscriptionId);
        checkout = { url: session.url, status: session.status };
      }
    } catch (caught) {
      checkoutIssue = caught instanceof Error ? caught.message : "The Checkout link could not be loaded.";
    }
  }

  return {
    visible: true,
    environmentIssue,
    collectionMethod: status.collectionMethod,
    preview,
    previewIssue,
    operation: operation ? { status: operation.status, failureMessage: operation.failureMessage } : null,
    checkout,
    checkoutIssue,
    linked: link ? { externalSubscriptionId: link.externalSubscriptionId, providerStatus: link.providerStatus } : null,
    openSchedules,
    converted: status.collectionMethod === "stripe_autocharge" && !operation && !link,
  };
}

/**
 * The whole owner-initiated activation in one guarded call: switch to Stripe collection, sign,
 * approve, create the one Checkout. If anything fails BEFORE the durable approval exists
 * (nothing has reached Stripe) the subscription is put back exactly as it was. A retry after an
 * approval exists reuses the stored authorization and the same idempotent operation.
 */
export async function startCanonicalStripeLiveCanaryFromOwner(input: {
  subscriptionId: string;
  environment?: CanonicalStripeLiveCanaryEnvironment;
}) {
  const environment = input.environment ?? process.env;
  assertCanonicalStripeLiveCanaryEnvironment(environment);
  if (environment.CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID?.trim() !== input.subscriptionId) {
    throw new Error("This subscription is not the allowlisted canary subscription.");
  }
  const ownerEmail = environment.CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL!.trim();

  const existing = await prisma.billingOperation.findFirst({
    where: { operationKey: { startsWith: "canonical-stripe-live-canary:" }, customerSubscriptionId: input.subscriptionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, metadata: true },
  });
  if (existing) {
    const stored = (existing.metadata as Prisma.JsonObject | null)?.liveCanaryAuthorization as unknown as CanonicalStripeLiveCanaryAuthorization | undefined;
    if (!stored) throw new Error("The existing canary operation lacks its stored authorization.");
    return executeCanonicalStripeLiveCanary({ operationId: existing.id, authorization: stored, environment });
  }

  let operationId: string;
  let authorization: CanonicalStripeLiveCanaryAuthorization;
  let converted = false;
  try {
    await convertSubscriptionToStripeCollectionForCanary(input.subscriptionId);
    converted = true;
    const proposal = await getCanonicalStripeLiveCanaryUnsignedProposal(input.subscriptionId);
    authorization = buildSignedCanonicalStripeLiveCanaryAuthorization({
      proposal,
      operation: "activate_subscription",
      externalSubscriptionId: null,
      environment,
    });
    const verified = await getCanonicalStripeLiveCanaryProposal({ authorization, environment });
    const approval = await approveCanonicalStripeLiveCanary({
      authorization,
      confirmationToken: verified.confirmationToken,
      approvedBy: ownerEmail,
      approvalReason: "Owner-approved single-customer live canary started from the Billing tab.",
      environment,
    });
    operationId = approval.operationId;
  } catch (error) {
    if (converted) {
      const stillNothingApproved = !(await prisma.billingOperation.findFirst({
        where: { operationKey: { startsWith: "canonical-stripe-live-canary:" }, customerSubscriptionId: input.subscriptionId },
        select: { id: true },
      }));
      if (stillNothingApproved) {
        await revertCanaryCollectionToRecurringInvoices(input.subscriptionId).catch(() => undefined);
      }
    }
    throw error;
  }
  return executeCanonicalStripeLiveCanary({ operationId, authorization, environment });
}

/** The immutable proposal stored with a COMPLETED canary activation; the basis for a cancellation authorization. */
export async function getCanonicalStripeLiveCanaryCompletedProposal(input: {
  subscriptionId: string;
  externalSubscriptionId: string;
}) {
  const operation = await prisma.billingOperation.findFirst({
    where: {
      operationKey: { startsWith: "canonical-stripe-live-canary:" },
      customerSubscriptionId: input.subscriptionId,
      providerSubscriptionReference: input.externalSubscriptionId,
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    select: { metadata: true },
  });
  if (!operation) throw new Error("A completed live-canary activation is required.");
  return storedCanonicalProposal(operation.metadata);
}

export async function getCanonicalStripeLiveCanaryProposal(input: {
  authorization: CanonicalStripeLiveCanaryAuthorization;
  environment?: CanonicalStripeLiveCanaryEnvironment;
}) {
  return getCanonicalStripeExecutionProposal({
    subscriptionId: input.authorization.subscriptionId,
    kind: "activation",
    observed: null,
    environment: input.environment,
    liveCanaryAuthorization: input.authorization,
  });
}

export async function approveCanonicalStripeLiveCanary(input: {
  authorization: CanonicalStripeLiveCanaryAuthorization;
  confirmationToken: string;
  approvedBy: string;
  approvalReason: string;
  environment?: CanonicalStripeLiveCanaryEnvironment;
}) {
  if (input.approvedBy.trim().toLowerCase() !== input.authorization.approvedByEmail.trim().toLowerCase()) {
    throw new Error("The durable operation approver must be the owner who signed the canary authorization.");
  }
  return approveCanonicalStripeOperation({
    subscriptionId: input.authorization.subscriptionId,
    kind: "activation",
    observed: null,
    confirmed: true,
    confirmationToken: input.confirmationToken,
    approvedBy: input.approvedBy,
    approvalReason: input.approvalReason,
    environment: input.environment,
    liveCanaryAuthorization: input.authorization,
  });
}

export async function executeCanonicalStripeLiveCanary(input: {
  operationId: string;
  authorization: CanonicalStripeLiveCanaryAuthorization;
  environment?: CanonicalStripeLiveCanaryEnvironment;
  adapter?: StripeLiveCanaryCanonicalProviderAdapter;
}) {
  const operation = await prisma.billingOperation.findUnique({
    where: { id: input.operationId },
    select: { metadata: true },
  });
  if (!operation) throw new Error("Canonical live-canary operation not found.");
  const proposal = storedCanonicalProposal(operation.metadata);
  const adapter = input.adapter ?? createStripeLiveCanaryCanonicalProviderAdapter({
    authorization: input.authorization,
    proposal,
    environment: input.environment,
  });
  return executeCanonicalStripeActivation({
    operationId: input.operationId,
    adapter,
    environment: input.environment,
  });
}

export async function getCanonicalStripeLiveCanaryStatus(subscriptionId: string) {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      customerId: true,
      lifecycleStatus: true,
      collectionHealth: true,
      collectionMethod: true,
      controlMode: true,
      currency: true,
      billingIntervalMonths: true,
      agreedAmountPerCycle: true,
      billingAnchorDate: true,
      nextBillingDate: true,
      providerLinks: {
        where: { provider: "stripe", endedAt: null },
        select: {
          id: true,
          externalSubscriptionId: true,
          providerStatus: true,
          lastSyncedAt: true,
          lastError: true,
          providerItems: {
            select: {
              externalSubscriptionItemId: true,
              externalPriceId: true,
              currency: true,
              billingIntervalMonths: true,
              agreedAmountPerCycle: true,
              quantity: true,
            },
          },
        },
      },
      billingOperations: {
        where: { operationKey: { startsWith: "canonical-stripe-live-canary:" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          operationKey: true,
          providerReference: true,
          providerSubscriptionReference: true,
          attemptCount: true,
          lastAttemptAt: true,
          nextRetryAt: true,
          completedAt: true,
          failureCode: true,
          failureMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      billingInvoices: {
        where: { provider: "stripe" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          externalInvoiceId: true,
          status: true,
          amountXcd: true,
          currency: true,
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          providerEventCreatedAt: true,
        },
      },
    },
  });
  if (!subscription) throw new Error("Canonical live-canary subscription not found.");
  return subscription;
}

export async function scheduleCanonicalStripeLiveCanaryCancellation(input: {
  authorization: CanonicalStripeLiveCanaryAuthorization;
  externalSubscriptionId: string;
  confirmationPhrase: string;
  environment?: CanonicalStripeLiveCanaryEnvironment;
  adapter?: StripeLiveCanaryCanonicalProviderAdapter;
}) {
  const environment = input.environment ?? process.env;
  const operation = await prisma.billingOperation.findFirst({
    where: {
      operationKey: { startsWith: "canonical-stripe-live-canary:" },
      customerSubscriptionId: input.authorization.subscriptionId,
      providerSubscriptionReference: input.externalSubscriptionId,
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, metadata: true },
  });
  if (!operation) throw new Error("A completed live-canary activation is required before cancellation.");
  const proposal = storedCanonicalProposal(operation.metadata);
  assertCanonicalStripeLiveCanaryAuthorization({
    proposal,
    authorization: input.authorization,
    expectedOperation: "cancel_subscription_at_period_end",
    externalSubscriptionId: input.externalSubscriptionId,
    environment,
  });
  const requiredPhrase = `CANCEL ${input.externalSubscriptionId} AT PERIOD END`;
  if (input.confirmationPhrase !== requiredPhrase) {
    throw new Error(`Cancellation requires the exact confirmation phrase: ${requiredPhrase}`);
  }
  const adapter = input.adapter ?? createStripeLiveCanaryCanonicalProviderAdapter({
    authorization: input.authorization,
    proposal,
    environment,
  });
  return adapter.scheduleCancellationAtPeriodEnd({
    externalSubscriptionId: input.externalSubscriptionId,
    canonicalSubscriptionId: input.authorization.subscriptionId,
    idempotencyKey: `tl-canonical-live-canary-cancel:${input.authorization.authorizationId}`,
  });
}
