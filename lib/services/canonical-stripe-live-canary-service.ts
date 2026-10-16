import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "@/lib/domain/canonical-stripe-live-canary";
import {
  approveCanonicalStripeOperation,
  executeCanonicalStripeActivation,
  getCanonicalStripeExecutionProposal,
} from "@/lib/services/canonical-stripe-execution-service";
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
