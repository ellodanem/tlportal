import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import {
  buildCanonicalStripeRateGroups,
  CanonicalStripeShadowError,
  planCanonicalStripeOperations,
  reconcileCanonicalStripeSubscription,
  type CanonicalStripeConfigurationInput,
  type CanonicalStripeOperationAction,
  type CanonicalStripeRateGroupPlan,
  type LocalStripeProviderLink,
  type ObservedStripeSubscription,
} from "@/lib/domain/canonical-stripe-shadow";

export const CANONICAL_STRIPE_EXECUTION_FLAG = "CANONICAL_STRIPE_EXECUTION_ENABLED";
export const CANONICAL_STRIPE_TEST_PROVIDER_FLAG = "CANONICAL_STRIPE_TEST_PROVIDER_ENABLED";

export type CanonicalStripeExecutionEnvironment = {
  CANONICAL_STRIPE_EXECUTION_ENABLED?: string;
  CANONICAL_STRIPE_TEST_PROVIDER_ENABLED?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export class CanonicalStripeExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeExecutionError";
    this.code = code;
  }
}

function executionError(code: string, message: string): never {
  throw new CanonicalStripeExecutionError(code, message);
}

export function canonicalStripeExecutionEnabled(
  environment: CanonicalStripeExecutionEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.VERCEL_ENV !== "production"
    && environment.CANONICAL_STRIPE_EXECUTION_ENABLED === "true";
}

export function assertCanonicalStripeExecutionEnabled(
  environment: CanonicalStripeExecutionEnvironment = process.env,
): void {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    executionError(
      "PRODUCTION_EXECUTION_DISABLED",
      "Canonical Stripe provider execution is disabled in production during Phase 3B2.",
    );
  }
  if (environment.CANONICAL_STRIPE_EXECUTION_ENABLED !== "true") {
    executionError(
      "EXECUTION_FEATURE_DISABLED",
      `${CANONICAL_STRIPE_EXECUTION_FLAG}=true is required for local canonical Stripe execution.`,
    );
  }
}

export function canonicalStripeTestProviderEnabled(
  environment: CanonicalStripeExecutionEnvironment = process.env,
): boolean {
  return canonicalStripeExecutionEnabled(environment)
    && environment.CANONICAL_STRIPE_TEST_PROVIDER_ENABLED === "true";
}

export function assertCanonicalStripeTestProviderEnabled(
  environment: CanonicalStripeExecutionEnvironment = process.env,
): void {
  assertCanonicalStripeExecutionEnabled(environment);
  if (environment.CANONICAL_STRIPE_TEST_PROVIDER_ENABLED !== "true") {
    executionError(
      "TEST_PROVIDER_FEATURE_DISABLED",
      `${CANONICAL_STRIPE_TEST_PROVIDER_FLAG}=true is required for isolated Stripe test-mode execution.`,
    );
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function serializedGroups(expected: CanonicalStripeRateGroupPlan) {
  return expected.groups.map((group) => ({
    fingerprint: group.fingerprint,
    currency: group.currency,
    billingIntervalMonths: group.billingIntervalMonths,
    agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
    quantity: group.quantity,
    recurringTotal: group.recurringTotal.toFixed(2),
    items: group.items.map((item) => ({ ...item })),
  }));
}

export function canonicalStripeSourceFingerprint(expected: CanonicalStripeRateGroupPlan): string {
  return fingerprint({
    version: 1,
    subscriptionId: expected.subscriptionId,
    customerId: expected.customerId,
    billingAnchorDate: expected.billingAnchorDate.toISOString().slice(0, 10),
    nextBillingDate: expected.nextBillingDate.toISOString().slice(0, 10),
    currency: expected.currency,
    billingIntervalMonths: expected.billingIntervalMonths,
    expectedRecurringTotal: expected.expectedRecurringTotal.toFixed(2),
    groups: serializedGroups(expected),
  });
}

export function canonicalStripeProviderStateFingerprint(
  observed: ObservedStripeSubscription,
): string {
  return fingerprint({
    version: 1,
    externalSubscriptionId: observed.externalSubscriptionId,
    status: observed.status,
    currentPeriodStart: observed.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: observed.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(observed.cancelAtPeriodEnd),
    items: [...observed.items]
      .map((item) => ({
        externalSubscriptionItemId: item.externalSubscriptionItemId,
        externalPriceId: item.externalPriceId,
        currency: item.currency?.toUpperCase() ?? null,
        billingIntervalMonths: item.billingIntervalMonths,
        unitAmount: item.unitAmount == null ? null : String(item.unitAmount),
        quantity: item.quantity,
      }))
      .sort((left, right) => left.externalSubscriptionItemId.localeCompare(right.externalSubscriptionItemId)),
  });
}

export type CanonicalStripeOperationKind = "activation" | "synchronization";

export type CanonicalStripeOperationProposal = {
  kind: CanonicalStripeOperationKind;
  subscriptionId: string;
  customerId: string;
  externalSubscriptionId: string | null;
  sourceFingerprint: string;
  providerStateFingerprint: string | null;
  requestFingerprint: string;
  operationKey: string;
  confirmationToken: string;
  expectedRecurringTotal: string;
  billingAnchorDate: Date;
  nextBillingDate: Date;
  currency: string;
  billingIntervalMonths: 1 | 3 | 6 | 12;
  actions: CanonicalStripeOperationAction[];
  rateGroups: ReturnType<typeof serializedGroups>;
};

function ensureEligibility(
  configuration: CanonicalStripeConfigurationInput,
  kind: CanonicalStripeOperationKind,
): void {
  if (configuration.controlMode === "legacy") {
    executionError("LEGACY_SUBSCRIPTION_PROTECTED", "Legacy subscriptions cannot execute canonical Stripe operations.");
  }
  if (configuration.controlMode !== "canonical") {
    executionError("CANONICAL_CONTROL_REQUIRED", "Canonical Stripe execution requires explicit canonical control.");
  }
  if (configuration.collectionMethod !== "stripe_autocharge") {
    executionError("STRIPE_COLLECTION_REQUIRED", "Canonical Stripe execution requires Stripe automatic collection.");
  }
  if (kind === "activation") {
    if (!configuration.lifecycleStatus || !["pending_activation", "active"].includes(configuration.lifecycleStatus)) {
      executionError(
        "ACTIVATION_LIFECYCLE_REQUIRED",
        "Activation requires an explicitly authorized pending-activation or active lifecycle.",
      );
    }
  } else if (configuration.lifecycleStatus !== "active") {
    executionError("ACTIVE_LIFECYCLE_REQUIRED", "Provider synchronization requires an active commercial lifecycle.");
  }
}

/** Build the immutable proposal that an operator must explicitly approve. */
export function buildCanonicalStripeOperationProposal(input: {
  kind: CanonicalStripeOperationKind;
  configuration: CanonicalStripeConfigurationInput;
  providerLink: LocalStripeProviderLink | null;
  observed: ObservedStripeSubscription | null;
  observedOwnerSubscriptionId?: string | null;
}): CanonicalStripeOperationProposal {
  ensureEligibility(input.configuration, input.kind);
  if (!input.configuration.nextBillingDate) {
    executionError("NEXT_BILLING_DATE_REQUIRED", "Next billing date is required for provider execution.");
  }

  let expected: CanonicalStripeRateGroupPlan;
  try {
    expected = buildCanonicalStripeRateGroups(
      input.configuration,
      input.configuration.nextBillingDate,
      { requireActive: false },
    );
  } catch (caught) {
    if (caught instanceof CanonicalStripeShadowError) {
      executionError(caught.code, caught.message);
    }
    throw caught;
  }
  const sourceFingerprint = canonicalStripeSourceFingerprint(expected);
  let providerStateFingerprint: string | null = null;
  let externalSubscriptionId: string | null = null;
  let actions: CanonicalStripeOperationAction[];

  if (input.kind === "activation") {
    if (input.providerLink || input.observed) {
      executionError(
        "PROVIDER_RELATIONSHIP_ALREADY_EXISTS",
        "Activation cannot create a competing provider relationship for this agreement.",
      );
    }
    actions = expected.groups.map((group) => ({
      kind: "create_rate_group" as const,
      fingerprint: group.fingerprint,
      externalSubscriptionItemId: null,
      externalPriceId: null,
      fromQuantity: null,
      toQuantity: group.quantity,
      agreedAmountPerCycle: group.agreedAmountPerCycle.toFixed(2),
      subscriptionItemIds: group.subscriptionItemIds,
    }));
  } else {
    if (!input.providerLink || !input.observed) {
      executionError("PROVIDER_EVIDENCE_REQUIRED", "Synchronization requires exact provider ownership and observed state.");
    }
    externalSubscriptionId = input.providerLink.externalSubscriptionId;
    providerStateFingerprint = canonicalStripeProviderStateFingerprint(input.observed);
    const reconciliation = reconcileCanonicalStripeSubscription({
      expected,
      providerLink: input.providerLink,
      observed: input.observed,
      observedOwnerSubscriptionId: input.observedOwnerSubscriptionId ?? null,
    });
    const unsafeCodes = new Set([
      "subscription_ownership_conflict",
      "provider_link_missing",
      "provider_link_ended",
      "provider_state_missing",
      "provider_subscription_mismatch",
      "provider_status_mismatch",
      "billing_anchor_mismatch",
      "missing_price_reference",
      "provider_mapping_mismatch",
    ]);
    const unsafe = reconciliation.issues.find((issue) => unsafeCodes.has(issue.code));
    if (unsafe) {
      executionError("RECONCILIATION_BLOCKED", unsafe.explanation);
    }
    const operationPlan = planCanonicalStripeOperations({
      expected,
      providerLink: input.providerLink,
      observed: input.observed,
      reconciliation,
    });
    if (operationPlan.blockers.length > 0) {
      executionError("RECONCILIATION_BLOCKED", operationPlan.blockers[0].explanation);
    }
    if (operationPlan.actions.length === 0) {
      executionError("NOTHING_TO_SYNCHRONIZE", "Provider state already matches the canonical subscription.");
    }
    actions = operationPlan.actions;
  }

  actions = [...actions].sort((left, right) =>
    [left.kind, left.fingerprint].join("\u0000").localeCompare([right.kind, right.fingerprint].join("\u0000")));
  const requestFingerprint = fingerprint({
    version: 1,
    kind: input.kind,
    subscriptionId: expected.subscriptionId,
    externalSubscriptionId,
    sourceFingerprint,
    providerStateFingerprint,
    effectiveAt: expected.nextBillingDate.toISOString().slice(0, 10),
    preserveBillingAnchor: true,
    prorationBehavior: "none",
    actions,
  });
  const operationKey = `canonical-stripe-${input.kind}:${expected.subscriptionId}:${requestFingerprint}`;
  return {
    kind: input.kind,
    subscriptionId: expected.subscriptionId,
    customerId: expected.customerId,
    externalSubscriptionId,
    sourceFingerprint,
    providerStateFingerprint,
    requestFingerprint,
    operationKey,
    confirmationToken: fingerprint({ approve: operationKey, requestFingerprint }),
    expectedRecurringTotal: expected.expectedRecurringTotal.toFixed(2),
    billingAnchorDate: expected.billingAnchorDate,
    nextBillingDate: expected.nextBillingDate,
    currency: expected.currency,
    billingIntervalMonths: expected.billingIntervalMonths,
    actions,
    rateGroups: serializedGroups(expected),
  };
}

export function assertCanonicalStripeOperationApproval(input: {
  proposal: CanonicalStripeOperationProposal;
  confirmed: boolean;
  confirmationToken: string;
  approvedBy: string;
  approvalReason: string;
}): void {
  if (!input.confirmed) {
    executionError("EXPLICIT_APPROVAL_REQUIRED", "Canonical Stripe provider execution requires explicit approval.");
  }
  if (input.confirmationToken !== input.proposal.confirmationToken) {
    executionError("APPROVAL_TOKEN_MISMATCH", "The approved operation no longer matches the reviewed proposal.");
  }
  if (!input.approvedBy.trim() || !input.approvalReason.trim()) {
    executionError("APPROVAL_EVIDENCE_REQUIRED", "Approver identity and reason are required.");
  }
}

export type CanonicalStripeProviderRateGroup = {
  fingerprint: string;
  externalSubscriptionItemId: string;
  externalPriceId: string;
  currency: string;
  billingIntervalMonths: number;
  agreedAmountPerCycle: Prisma.Decimal | string;
  quantity: number;
};

export type CanonicalStripeProviderMutationResult = {
  subscription: ObservedStripeSubscription;
  rateGroups: CanonicalStripeProviderRateGroup[];
};

export type CanonicalStripeCheckoutSession = {
  id: string;
  status: "open" | "complete" | "expired";
  url: string | null;
  externalSubscriptionId: string | null;
};

/** Provider mutations remain behind the canonical execution and provider-mode guards. */
export interface CanonicalStripeProviderAdapter {
  readonly kind: "mock" | "stripe_test";
  retrieveSubscription(externalSubscriptionId: string): Promise<ObservedStripeSubscription | null>;
  retrieveCheckoutSession(
    sessionId: string,
    operationKey: string,
    subscriptionId: string,
  ): Promise<CanonicalStripeCheckoutSession>;
  recoverActivation(operationKey: string, subscriptionId: string): Promise<CanonicalStripeCheckoutSession | null>;
  createActivationCheckout(
    proposal: CanonicalStripeOperationProposal,
    idempotencyKey: string,
  ): Promise<CanonicalStripeCheckoutSession>;
  expireCheckoutSession(sessionId: string, idempotencyKey: string): Promise<CanonicalStripeCheckoutSession>;
  recoverSynchronization(
    operationKey: string,
    externalSubscriptionId: string,
  ): Promise<CanonicalStripeProviderMutationResult | null>;
  synchronizeSubscription(
    proposal: CanonicalStripeOperationProposal,
    idempotencyKey: string,
  ): Promise<CanonicalStripeProviderMutationResult>;
}

export type CanonicalStripeExecutionResult = {
  operationId: string;
  operationKey: string;
  status: "reconciled" | "pending" | "retry_required" | "manual_review";
  providerReference: string | null;
  externalSubscriptionId: string | null;
  reusedProviderResult: boolean;
  message: string | null;
};
