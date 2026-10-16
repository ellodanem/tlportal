import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalStripeExecutionEnabled,
  assertCanonicalStripeOperationApproval,
  buildCanonicalStripeOperationProposal,
  canonicalStripeProviderStateFingerprint,
  canonicalStripeSourceFingerprint,
  CanonicalStripeExecutionError,
  type CanonicalStripeCheckoutSession,
  type CanonicalStripeExecutionEnvironment,
  type CanonicalStripeExecutionResult,
  type CanonicalStripeOperationKind,
  type CanonicalStripeOperationProposal,
  type CanonicalStripeProviderAdapter,
  type CanonicalStripeProviderMutationResult,
} from "@/lib/domain/canonical-stripe-execution";
import {
  buildCanonicalStripeRateGroups,
  reconcileCanonicalStripeSubscription,
  type LocalStripeProviderLink,
  type ObservedStripeSubscription,
} from "@/lib/domain/canonical-stripe-shadow";

const configurationInclude = {
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

type SubscriptionConfiguration = Prisma.CustomerSubscriptionGetPayload<{
  include: typeof configurationInclude;
}>;

type OperationMetadata = {
  phase: "3B2";
  approvedBy: string;
  approvalReason: string;
  approvedAt: string;
  proposal: SerializedProposal;
  result?: {
    classification: string;
    reconciledAt: string;
    reconciliationStatus: string;
  };
};

type SerializedProposal = Omit<
  CanonicalStripeOperationProposal,
  "billingAnchorDate" | "nextBillingDate"
> & {
  billingAnchorDate: string;
  nextBillingDate: string;
};

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const PROVIDER_IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;

function retryableSerializableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  return candidate.code === "P2034"
    || candidate.code === "P2010" && candidate.meta?.code === "40001";
}

async function runSerializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (caught) {
      lastError = caught;
      if (!retryableSerializableError(caught)) throw caught;
    }
  }
  throw lastError;
}

function executionError(code: string, message: string): never {
  throw new CanonicalStripeExecutionError(code, message);
}

function providerLinkInput(link: SubscriptionConfiguration["providerLinks"][number]): LocalStripeProviderLink {
  return link;
}

function serializeProposal(proposal: CanonicalStripeOperationProposal): SerializedProposal {
  return {
    ...proposal,
    billingAnchorDate: proposal.billingAnchorDate.toISOString(),
    nextBillingDate: proposal.nextBillingDate.toISOString(),
  };
}

function deserializeProposal(value: SerializedProposal): CanonicalStripeOperationProposal {
  return {
    ...value,
    billingAnchorDate: new Date(value.billingAnchorDate),
    nextBillingDate: new Date(value.nextBillingDate),
  };
}

function operationMetadata(value: Prisma.JsonValue | null): OperationMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    executionError("OPERATION_METADATA_INVALID", "Canonical Stripe operation approval metadata is missing.");
  }
  const metadata = value as unknown as Partial<OperationMetadata>;
  if (metadata.phase !== "3B2" || !metadata.proposal || !metadata.approvedBy || !metadata.approvalReason) {
    executionError("OPERATION_METADATA_INVALID", "Canonical Stripe operation approval metadata is incomplete.");
  }
  return metadata as OperationMetadata;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function loadConfiguration(
  client: Prisma.TransactionClient | typeof prisma,
  subscriptionId: string,
): Promise<SubscriptionConfiguration> {
  const subscription = await client.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: configurationInclude,
  });
  if (!subscription) executionError("SUBSCRIPTION_NOT_FOUND", "Canonical subscription not found.");
  return subscription;
}

function oneOpenProviderLink(subscription: SubscriptionConfiguration): LocalStripeProviderLink | null {
  const links = subscription.providerLinks.filter((link) => link.endedAt == null);
  if (links.length > 1) {
    executionError("PROVIDER_LINK_AMBIGUOUS", "More than one open Stripe relationship exists.");
  }
  return links[0] ? providerLinkInput(links[0]) : null;
}

async function observedOwnerSubscriptionId(
  observed: ObservedStripeSubscription | null,
): Promise<string | null> {
  if (!observed) return null;
  const owner = await prisma.subscriptionProviderLink.findFirst({
    where: { provider: "stripe", externalSubscriptionId: observed.externalSubscriptionId },
    select: { customerSubscriptionId: true },
  });
  return owner?.customerSubscriptionId ?? null;
}

export async function getCanonicalStripeExecutionProposal(input: {
  subscriptionId: string;
  kind: CanonicalStripeOperationKind;
  observed: ObservedStripeSubscription | null;
  environment?: CanonicalStripeExecutionEnvironment;
}): Promise<CanonicalStripeOperationProposal> {
  assertCanonicalStripeExecutionEnabled(input.environment);
  const subscription = await loadConfiguration(prisma, input.subscriptionId);
  return buildCanonicalStripeOperationProposal({
    kind: input.kind,
    configuration: subscription,
    providerLink: oneOpenProviderLink(subscription),
    observed: input.observed,
    observedOwnerSubscriptionId: await observedOwnerSubscriptionId(input.observed),
  });
}

export async function approveCanonicalStripeOperation(input: {
  subscriptionId: string;
  kind: CanonicalStripeOperationKind;
  observed: ObservedStripeSubscription | null;
  confirmed: boolean;
  confirmationToken: string;
  approvedBy: string;
  approvalReason: string;
  environment?: CanonicalStripeExecutionEnvironment;
}): Promise<{ operationId: string; operationKey: string; reused: boolean }> {
  const proposal = await getCanonicalStripeExecutionProposal(input);
  assertCanonicalStripeOperationApproval({
    proposal,
    confirmed: input.confirmed,
    confirmationToken: input.confirmationToken,
    approvedBy: input.approvedBy,
    approvalReason: input.approvalReason,
  });
  const activeKey = `canonical-stripe:${proposal.subscriptionId}`;
  const operationType = input.kind === "activation"
    ? "canonical_stripe_activation" as const
    : "canonical_stripe_synchronization" as const;

  return runSerializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${proposal.subscriptionId} FOR UPDATE`;
    const existing = await tx.billingOperation.findUnique({ where: { operationKey: proposal.operationKey } });
    if (existing) {
      if (existing.requestFingerprint !== proposal.requestFingerprint) {
        executionError("OPERATION_IDENTITY_CONFLICT", "Existing operation identity has a different approved payload.");
      }
      return { operationId: existing.id, operationKey: existing.operationKey, reused: true };
    }
    const competing = await tx.billingOperation.findUnique({ where: { activeKey } });
    if (competing) {
      executionError(
        "COMPETING_OPERATION_EXISTS",
        "An unresolved canonical Stripe operation already exists for this subscription.",
      );
    }
    const created = await tx.billingOperation.create({
      data: {
        type: operationType,
        status: "pending",
        customerId: proposal.customerId,
        customerSubscriptionId: proposal.subscriptionId,
        operationKey: proposal.operationKey,
        activeKey,
        requestFingerprint: proposal.requestFingerprint,
        metadata: jsonValue({
          phase: "3B2",
          approvedBy: input.approvedBy.trim(),
          approvalReason: input.approvalReason.trim(),
          approvedAt: new Date().toISOString(),
          proposal: serializeProposal(proposal),
        } satisfies OperationMetadata),
      },
    });
    return { operationId: created.id, operationKey: created.operationKey, reused: false };
  });
}

type ClaimedOperation = {
  claimed: boolean;
  operationId: string;
  operationKey: string;
  proposal: CanonicalStripeOperationProposal;
  providerReference: string | null;
  providerSubscriptionReference: string | null;
  priorAttemptCount: number;
  priorLastAttemptAt: Date | null;
  completed: boolean;
};

async function claimOperation(
  operationId: string,
  expectedKind: CanonicalStripeOperationKind,
): Promise<ClaimedOperation> {
  return runSerializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "BillingOperation" WHERE "id" = ${operationId} FOR UPDATE`;
    const operation = await tx.billingOperation.findUnique({ where: { id: operationId } });
    if (!operation) executionError("OPERATION_NOT_FOUND", "Canonical Stripe operation not found.");
    const expectedType = expectedKind === "activation"
      ? "canonical_stripe_activation"
      : "canonical_stripe_synchronization";
    if (operation.type !== expectedType) {
      executionError("OPERATION_TYPE_MISMATCH", "Canonical Stripe operation type does not match the executor.");
    }
    if (!operation.customerSubscriptionId) {
      executionError("OPERATION_SUBSCRIPTION_MISSING", "Canonical operation has no exact subscription identity.");
    }
    const metadata = operationMetadata(operation.metadata);
    const proposal = deserializeProposal(metadata.proposal);
    if (
      proposal.kind !== expectedKind
      || proposal.subscriptionId !== operation.customerSubscriptionId
      || proposal.requestFingerprint !== operation.requestFingerprint
    ) {
      executionError("APPROVED_PLAN_MISMATCH", "Stored approval does not match the durable operation.");
    }

    const subscription = await loadConfiguration(tx, operation.customerSubscriptionId);
    if (subscription.controlMode !== "canonical") {
      executionError("CANONICAL_CONTROL_REQUIRED", "Canonical control authorization was removed.");
    }
    if (subscription.collectionMethod !== "stripe_autocharge") {
      executionError("STRIPE_COLLECTION_REQUIRED", "Stripe automatic collection authorization was removed.");
    }
    if (
      (expectedKind === "activation" && !["pending_activation", "active"].includes(subscription.lifecycleStatus ?? ""))
      || (expectedKind === "synchronization" && subscription.lifecycleStatus !== "active")
    ) {
      executionError("LIFECYCLE_NO_LONGER_ELIGIBLE", "Subscription lifecycle is no longer eligible for this operation.");
    }
    if (!subscription.nextBillingDate) {
      executionError("NEXT_BILLING_DATE_REQUIRED", "Next billing date is required.");
    }
    const expected = buildCanonicalStripeRateGroups(subscription, subscription.nextBillingDate, { requireActive: false });
    if (canonicalStripeSourceFingerprint(expected) !== proposal.sourceFingerprint) {
      executionError("STALE_CANONICAL_SOURCE", "Canonical commercial state changed after operation approval.");
    }
    const openLink = oneOpenProviderLink(subscription);
    if (expectedKind === "activation" && openLink) {
      executionError("PROVIDER_RELATIONSHIP_ALREADY_EXISTS", "Activation would compete with an existing provider relationship.");
    }
    if (
      expectedKind === "synchronization"
      && (!openLink || openLink.externalSubscriptionId !== proposal.externalSubscriptionId)
    ) {
      executionError("PROVIDER_OWNERSHIP_CHANGED", "Exact provider ownership changed after approval.");
    }

    if (operation.status === "completed") {
      return {
        claimed: false,
        operationId: operation.id,
        operationKey: operation.operationKey,
        proposal,
        providerReference: operation.providerReference,
        providerSubscriptionReference: operation.providerSubscriptionReference,
        priorAttemptCount: operation.attemptCount,
        priorLastAttemptAt: operation.lastAttemptAt,
        completed: true,
      };
    }
    if (["STALE_PROVIDER_STATE", "IDEMPOTENCY_WINDOW_EXPIRED", "RECONCILIATION_REQUIRED"].includes(operation.failureCode ?? "")) {
      executionError("MANUAL_REVIEW_REQUIRED", operation.failureMessage ?? "Operation requires a new review.");
    }
    const now = new Date();
    if (
      operation.status === "in_progress"
      && operation.lastAttemptAt
      && operation.lastAttemptAt.getTime() > now.getTime() - CLAIM_TIMEOUT_MS
    ) {
      return {
        claimed: false,
        operationId: operation.id,
        operationKey: operation.operationKey,
        proposal,
        providerReference: operation.providerReference,
        providerSubscriptionReference: operation.providerSubscriptionReference,
        priorAttemptCount: operation.attemptCount,
        priorLastAttemptAt: operation.lastAttemptAt,
        completed: false,
      };
    }
    if (operation.status === "failed") {
      executionError("OPERATION_FAILED", "Failed canonical operations require a new explicit approval.");
    }
    await tx.billingOperation.update({
      where: { id: operation.id },
      data: {
        status: "in_progress",
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        nextRetryAt: null,
        failureCode: null,
        failureMessage: null,
      },
    });
    return {
      claimed: true,
      operationId: operation.id,
      operationKey: operation.operationKey,
      proposal,
      providerReference: operation.providerReference,
      providerSubscriptionReference: operation.providerSubscriptionReference,
      priorAttemptCount: operation.attemptCount,
      priorLastAttemptAt: operation.lastAttemptAt,
      completed: false,
    };
  });
}

async function markRetryRequired(
  operationId: string,
  code: string,
  message: string,
  options: { manual?: boolean } = {},
): Promise<void> {
  await prisma.billingOperation.updateMany({
    where: { id: operationId, status: { not: "completed" } },
    data: {
      status: "retry_required",
      failureCode: code,
      failureMessage: message.slice(0, 2000),
      nextRetryAt: options.manual ? null : new Date(),
    },
  });
}

function resultFromClaim(claim: ClaimedOperation): CanonicalStripeExecutionResult {
  return {
    operationId: claim.operationId,
    operationKey: claim.operationKey,
    status: claim.completed ? "reconciled" : "pending",
    providerReference: claim.providerReference,
    externalSubscriptionId: claim.providerSubscriptionReference,
    reusedProviderResult: true,
    message: claim.completed ? null : "Another execution attempt is already in progress.",
  };
}

function providerWindowExpired(claim: ClaimedOperation): boolean {
  return claim.priorAttemptCount > 0
    && claim.priorLastAttemptAt != null
    && claim.priorLastAttemptAt.getTime() <= Date.now() - PROVIDER_IDEMPOTENCY_WINDOW_MS;
}

async function recordCheckoutSession(
  operationId: string,
  session: CanonicalStripeCheckoutSession,
): Promise<void> {
  await prisma.billingOperation.update({
    where: { id: operationId },
    data: {
      providerReference: session.id,
      providerSubscriptionReference: session.externalSubscriptionId,
      status: "pending",
      nextRetryAt: null,
    },
  });
}

export async function executeCanonicalStripeActivation(input: {
  operationId: string;
  adapter: CanonicalStripeProviderAdapter;
  environment?: CanonicalStripeExecutionEnvironment;
}): Promise<CanonicalStripeExecutionResult> {
  assertCanonicalStripeExecutionEnabled(input.environment);
  if (input.adapter.kind !== "mock") {
    executionError("MOCK_PROVIDER_REQUIRED", "Phase 3B2 permits only an isolated mock Stripe adapter.");
  }
  const claim = await claimOperation(input.operationId, "activation");
  if (!claim.claimed) return resultFromClaim(claim);

  try {
    let session: CanonicalStripeCheckoutSession | null = claim.providerReference
      ? await input.adapter.retrieveCheckoutSession(claim.providerReference)
      : await input.adapter.recoverActivation(claim.operationKey, claim.proposal.subscriptionId);
    const recovered = session != null;
    if (!session) {
      if (providerWindowExpired(claim)) {
        const message = "No activation result was found after the provider idempotency window; manual reconciliation is required.";
        await markRetryRequired(claim.operationId, "IDEMPOTENCY_WINDOW_EXPIRED", message, { manual: true });
        return {
          operationId: claim.operationId,
          operationKey: claim.operationKey,
          status: "manual_review",
          providerReference: null,
          externalSubscriptionId: null,
          reusedProviderResult: false,
          message,
        };
      }
      session = await input.adapter.createActivationCheckout(
        claim.proposal,
        `tl-canonical-activation:${claim.operationKey}`,
      );
    }
    if (session.status === "expired") {
      session = await input.adapter.createActivationCheckout(
        claim.proposal,
        `tl-canonical-activation-replace:${claim.operationKey}`,
      );
    }
    await recordCheckoutSession(claim.operationId, session);
    return {
      operationId: claim.operationId,
      operationKey: claim.operationKey,
      status: "pending",
      providerReference: session.id,
      externalSubscriptionId: session.externalSubscriptionId,
      reusedProviderResult: recovered,
      message: session.status === "complete"
        ? "Checkout completed; exact subscription item evidence is required from canonical webhook fulfillment."
        : null,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Canonical activation provider request failed.";
    await markRetryRequired(claim.operationId, "PROVIDER_REQUEST_UNCERTAIN", message);
    return {
      operationId: claim.operationId,
      operationKey: claim.operationKey,
      status: "retry_required",
      providerReference: claim.providerReference,
      externalSubscriptionId: claim.providerSubscriptionReference,
      reusedProviderResult: false,
      message,
    };
  }
}

export async function persistCanonicalStripeProviderResult(input: {
  operationId: string;
  result: CanonicalStripeProviderMutationResult;
  providerEventAt?: Date;
}): Promise<CanonicalStripeExecutionResult> {
  return runSerializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "BillingOperation" WHERE "id" = ${input.operationId} FOR UPDATE`;
    const operation = await tx.billingOperation.findUnique({ where: { id: input.operationId } });
    if (!operation || !operation.customerSubscriptionId) {
      executionError("OPERATION_NOT_FOUND", "Canonical Stripe operation not found.");
    }
    const metadata = operationMetadata(operation.metadata);
    const proposal = deserializeProposal(metadata.proposal);
    if (operation.status === "completed") {
      return {
        operationId: operation.id,
        operationKey: operation.operationKey,
        status: "reconciled",
        providerReference: operation.providerReference,
        externalSubscriptionId: operation.providerSubscriptionReference,
        reusedProviderResult: true,
        message: null,
      };
    }
    const subscription = await loadConfiguration(tx, operation.customerSubscriptionId);
    if (!subscription.nextBillingDate) executionError("NEXT_BILLING_DATE_REQUIRED", "Next billing date is required.");
    const expected = buildCanonicalStripeRateGroups(subscription, subscription.nextBillingDate, { requireActive: false });
    if (canonicalStripeSourceFingerprint(expected) !== proposal.sourceFingerprint) {
      executionError("STALE_CANONICAL_SOURCE", "Canonical commercial state changed before local persistence.");
    }
    if (
      proposal.externalSubscriptionId
      && proposal.externalSubscriptionId !== input.result.subscription.externalSubscriptionId
    ) {
      executionError("PROVIDER_SUBSCRIPTION_MISMATCH", "Provider result does not belong to the approved subscription.");
    }
    const existingOwner = await tx.subscriptionProviderLink.findFirst({
      where: {
        provider: "stripe",
        externalSubscriptionId: input.result.subscription.externalSubscriptionId,
      },
      include: { providerItems: true },
    });
    if (existingOwner && existingOwner.customerSubscriptionId !== subscription.id) {
      executionError("SUBSCRIPTION_OWNERSHIP_CONFLICT", "Provider subscription belongs to another canonical agreement.");
    }
    let link = existingOwner;
    if (!link) {
      if (proposal.kind !== "activation") {
        executionError("PROVIDER_LINK_MISSING", "Synchronization cannot create an unapproved provider relationship.");
      }
      link = await tx.subscriptionProviderLink.create({
        data: {
          customerSubscriptionId: subscription.id,
          provider: "stripe",
          externalSubscriptionId: input.result.subscription.externalSubscriptionId,
          providerStatus: input.result.subscription.status,
          activatedAt: input.providerEventAt ?? new Date(),
          lastSyncedAt: input.providerEventAt ?? new Date(),
          metadata: jsonValue({ phase: "3B2", operationKey: operation.operationKey }),
        },
        include: { providerItems: true },
      });
    }
    if (link.customerSubscriptionId !== subscription.id || link.endedAt) {
      executionError("PROVIDER_OWNERSHIP_CHANGED", "Provider relationship is not the active approved relationship.");
    }

    const expectedFingerprints = new Set(expected.groups.map((group) => group.fingerprint));
    const suppliedFingerprints = new Set(input.result.rateGroups.map((group) => group.fingerprint));
    if (
      expectedFingerprints.size !== suppliedFingerprints.size
      || [...expectedFingerprints].some((entry) => !suppliedFingerprints.has(entry))
    ) {
      executionError("PROVIDER_RATE_GROUP_MISMATCH", "Provider result does not contain the exact expected rate groups.");
    }
    for (const group of expected.groups) {
      const supplied = input.result.rateGroups.find((entry) => entry.fingerprint === group.fingerprint)!;
      if (
        supplied.currency.toUpperCase() !== group.currency
        || supplied.billingIntervalMonths !== group.billingIntervalMonths
        || !new Prisma.Decimal(supplied.agreedAmountPerCycle).equals(group.agreedAmountPerCycle)
        || supplied.quantity !== group.quantity
        || !supplied.externalPriceId.trim()
        || !supplied.externalSubscriptionItemId.trim()
      ) {
        executionError("PROVIDER_RATE_GROUP_MISMATCH", `Provider rate group ${group.fingerprint} differs from approval.`);
      }
      const existing = await tx.subscriptionProviderItem.findFirst({
        where: { subscriptionProviderLinkId: link.id, rateGroupFingerprint: group.fingerprint },
      });
      const data = {
        externalSubscriptionItemId: supplied.externalSubscriptionItemId,
        externalPriceId: supplied.externalPriceId,
        currency: group.currency,
        billingIntervalMonths: group.billingIntervalMonths,
        agreedAmountPerCycle: group.agreedAmountPerCycle,
        quantity: group.quantity,
        lastSyncedAt: input.providerEventAt ?? new Date(),
      };
      if (existing) {
        await tx.subscriptionProviderItem.update({ where: { id: existing.id }, data });
      } else {
        await tx.subscriptionProviderItem.create({
          data: { ...data, subscriptionProviderLinkId: link.id, rateGroupFingerprint: group.fingerprint },
        });
      }
    }
    await tx.subscriptionProviderItem.deleteMany({
      where: {
        subscriptionProviderLinkId: link.id,
        rateGroupFingerprint: { notIn: [...expectedFingerprints] },
      },
    });
    await tx.subscriptionProviderLink.update({
      where: { id: link.id },
      data: {
        providerStatus: input.result.subscription.status,
        lastSyncedAt: input.providerEventAt ?? new Date(),
        lastError: null,
      },
    });
    const persistedLink = await tx.subscriptionProviderLink.findUniqueOrThrow({
      where: { id: link.id },
      include: { providerItems: { orderBy: { rateGroupFingerprint: "asc" } } },
    });
    const reconciliation = reconcileCanonicalStripeSubscription({
      expected,
      providerLink: providerLinkInput(persistedLink as SubscriptionConfiguration["providerLinks"][number]),
      observed: input.result.subscription,
      observedOwnerSubscriptionId: subscription.id,
    });
    if (reconciliation.status !== "matched") {
      executionError(
        "POST_OPERATION_RECONCILIATION_FAILED",
        reconciliation.issues[0]?.explanation ?? "Provider result did not reconcile.",
      );
    }
    if (proposal.kind === "activation") {
      await tx.customerSubscription.update({
        where: { id: subscription.id },
        data: { lifecycleStatus: "active", status: "active" },
      });
      await tx.subscriptionItem.updateMany({
        where: { customerSubscriptionId: subscription.id, status: "pending_activation" },
        data: { status: "active" },
      });
    }
    const completedAt = new Date();
    await tx.billingOperation.update({
      where: { id: operation.id },
      data: {
        status: "completed",
        activeKey: null,
        providerSubscriptionReference: input.result.subscription.externalSubscriptionId,
        completedAt,
        nextRetryAt: null,
        failureCode: null,
        failureMessage: null,
        metadata: jsonValue({
          ...metadata,
          result: {
            classification: "reconciled",
            reconciledAt: completedAt.toISOString(),
            reconciliationStatus: reconciliation.status,
          },
        } satisfies OperationMetadata),
      },
    });
    return {
      operationId: operation.id,
      operationKey: operation.operationKey,
      status: "reconciled",
      providerReference: operation.providerReference,
      externalSubscriptionId: input.result.subscription.externalSubscriptionId,
      reusedProviderResult: false,
      message: null,
    };
  });
}

export async function executeCanonicalStripeSynchronization(input: {
  operationId: string;
  adapter: CanonicalStripeProviderAdapter;
  environment?: CanonicalStripeExecutionEnvironment;
  beforePersist?: (result: CanonicalStripeProviderMutationResult) => Promise<void>;
}): Promise<CanonicalStripeExecutionResult> {
  assertCanonicalStripeExecutionEnabled(input.environment);
  if (input.adapter.kind !== "mock") {
    executionError("MOCK_PROVIDER_REQUIRED", "Phase 3B2 permits only an isolated mock Stripe adapter.");
  }
  const claim = await claimOperation(input.operationId, "synchronization");
  if (!claim.claimed) return resultFromClaim(claim);
  const externalSubscriptionId = claim.proposal.externalSubscriptionId;
  if (!externalSubscriptionId || !claim.proposal.providerStateFingerprint) {
    executionError("PROVIDER_EVIDENCE_REQUIRED", "Approved synchronization lacks provider evidence.");
  }

  let providerResultAvailable = false;
  try {
    const [current, recovered] = await Promise.all([
      input.adapter.retrieveSubscription(externalSubscriptionId),
      input.adapter.recoverSynchronization(claim.operationKey, externalSubscriptionId),
    ]);
    let result = recovered;
    if (!result) {
      if (!current || canonicalStripeProviderStateFingerprint(current) !== claim.proposal.providerStateFingerprint) {
        const message = "Provider state changed after approval; create and approve a new reconciliation plan.";
        await markRetryRequired(claim.operationId, "STALE_PROVIDER_STATE", message, { manual: true });
        return {
          operationId: claim.operationId,
          operationKey: claim.operationKey,
          status: "manual_review",
          providerReference: claim.providerReference,
          externalSubscriptionId,
          reusedProviderResult: false,
          message,
        };
      }
      if (providerWindowExpired(claim)) {
        const message = "No provider result was found after the idempotency window; manual reconciliation is required.";
        await markRetryRequired(claim.operationId, "IDEMPOTENCY_WINDOW_EXPIRED", message, { manual: true });
        return {
          operationId: claim.operationId,
          operationKey: claim.operationKey,
          status: "manual_review",
          providerReference: claim.providerReference,
          externalSubscriptionId,
          reusedProviderResult: false,
          message,
        };
      }
      result = await input.adapter.synchronizeSubscription(
        claim.proposal,
        `tl-canonical-sync:${claim.operationKey}`,
      );
    }
    providerResultAvailable = true;
    await input.beforePersist?.(result);
    const persisted = await persistCanonicalStripeProviderResult({ operationId: claim.operationId, result });
    return { ...persisted, reusedProviderResult: recovered != null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Canonical Stripe synchronization failed.";
    await markRetryRequired(
      claim.operationId,
      caught instanceof CanonicalStripeExecutionError
        ? caught.code
        : providerResultAvailable
          ? "LOCAL_PERSISTENCE_FAILED"
          : "PROVIDER_REQUEST_UNCERTAIN",
      message,
    );
    return {
      operationId: claim.operationId,
      operationKey: claim.operationKey,
      status: "retry_required",
      providerReference: claim.providerReference,
      externalSubscriptionId,
      reusedProviderResult: false,
      message,
    };
  }
}

export async function findCanonicalStripeOperationForWebhook(input: {
  operationKey?: string | null;
  externalSubscriptionId?: string | null;
}): Promise<{ id: string; operationKey: string } | null> {
  if (input.operationKey) {
    const direct = await prisma.billingOperation.findUnique({
      where: { operationKey: input.operationKey },
      select: { id: true, operationKey: true, type: true },
    });
    if (direct && ["canonical_stripe_activation", "canonical_stripe_synchronization"].includes(direct.type)) {
      return { id: direct.id, operationKey: direct.operationKey };
    }
  }
  if (!input.externalSubscriptionId) return null;
  const operation = await prisma.billingOperation.findFirst({
    where: {
      type: { in: ["canonical_stripe_activation", "canonical_stripe_synchronization"] },
      providerSubscriptionReference: input.externalSubscriptionId,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, operationKey: true },
  });
  return operation;
}
