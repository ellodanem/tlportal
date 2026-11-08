import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { CanonicalStripeOperationProposal } from "@/lib/domain/canonical-stripe-execution";

export const CANONICAL_STRIPE_LIVE_CANARY_FLAG = "CANONICAL_STRIPE_LIVE_CANARY_ENABLED";
export const CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID = "CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID";
export const CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID = "CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID";
export const CANONICAL_STRIPE_LIVE_CANARY_ACCOUNT_ID = "CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID";
export const CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL = "CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL";
export const CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET = "CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET";

export const LIVE_CANARY_CURRENCY = "XCD";
export const CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT = "CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT";
/** Default cap when the owner has not raised it. */
export const LIVE_CANARY_MAX_RECURRING_AMOUNT = "5.00";
/** Even a deliberate setting can never exceed this, so a typo cannot open the canary wide. */
export const LIVE_CANARY_ABSOLUTE_MAX_RECURRING_AMOUNT = "100.00";
export const LIVE_CANARY_AUTHORIZATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const LIVE_CANARY_PROVIDER_CONTEXT = "stripe_live_canary" as const;

export type CanonicalStripeLiveCanaryAuthorizedOperation =
  | "activate_subscription"
  | "cancel_subscription_at_period_end";

export type CanonicalStripeLiveCanaryEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  CANONICAL_STRIPE_LIVE_CANARY_ENABLED?: string;
  CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID?: string;
  CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID?: string;
  CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID?: string;
  CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL?: string;
  CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET?: string;
  CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export type CanonicalStripeLiveCanaryAuthorization = {
  authorizationId: string;
  operation: CanonicalStripeLiveCanaryAuthorizedOperation;
  operationKey: string;
  requestFingerprint: string;
  sourceFingerprint: string;
  proposalDigest: string;
  providerContext: typeof LIVE_CANARY_PROVIDER_CONTEXT;
  providerAccountId: string;
  externalSubscriptionId: string | null;
  approvedByEmail: string;
  customerId: string;
  subscriptionId: string;
  currency: string;
  recurringAmount: string;
  taxAmount: string;
  totalExpectedCharge: string;
  billingIntervalMonths: number;
  renewalDate: string;
  cancellationProcedure: "cancel_at_period_end_and_verify";
  customerIdentityConfirmed: boolean;
  subscriptionConfirmed: boolean;
  chargeConfirmed: boolean;
  minimumChargeConfirmed: boolean;
  renewalConfirmed: boolean;
  cancellationConfirmed: boolean;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

export class CanonicalStripeLiveCanaryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeLiveCanaryError";
    this.code = code;
  }
}

function canaryError(code: string, message: string): never {
  throw new CanonicalStripeLiveCanaryError(code, message);
}

function required(environment: CanonicalStripeLiveCanaryEnvironment, key: keyof CanonicalStripeLiveCanaryEnvironment): string {
  const value = environment[key]?.trim();
  if (!value) canaryError("CANARY_CONFIGURATION_MISSING", `${key} is required for a live canary.`);
  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedAmount(value: string, label: string): string {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    canaryError("CANARY_AMOUNT_INVALID", `${label} must be a valid decimal amount.`);
  }
  if (amount.isNegative() || amount.decimalPlaces() > 2) {
    canaryError("CANARY_AMOUNT_INVALID", `${label} must be non-negative with no more than two decimal places.`);
  }
  return amount.toFixed(2);
}

/**
 * The most the canary may charge per cycle. EC$5.00 unless the owner sets
 * CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT, and never above EC$100.00.
 * Must be set identically wherever the canary is checked (the runner and the webhook).
 */
export function liveCanaryMaxRecurringAmount(
  environment: CanonicalStripeLiveCanaryEnvironment = process.env,
): string {
  const configured = environment.CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT?.trim();
  if (!configured) return LIVE_CANARY_MAX_RECURRING_AMOUNT;
  const amount = new Prisma.Decimal(normalizedAmount(configured, CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT));
  if (amount.lessThanOrEqualTo(0) || amount.greaterThan(LIVE_CANARY_ABSOLUTE_MAX_RECURRING_AMOUNT)) {
    canaryError(
      "CANARY_CAP_INVALID",
      `${CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT} must be greater than 0 and no more than EC$${LIVE_CANARY_ABSOLUTE_MAX_RECURRING_AMOUNT}.`,
    );
  }
  return amount.toFixed(2);
}

export function canonicalStripeLiveCanaryProposalDigest(
  proposal: CanonicalStripeOperationProposal,
): string {
  const payload = {
    kind: proposal.kind,
    subscriptionId: proposal.subscriptionId,
    customerId: proposal.customerId,
    externalSubscriptionId: proposal.externalSubscriptionId,
    sourceFingerprint: proposal.sourceFingerprint,
    providerStateFingerprint: proposal.providerStateFingerprint,
    requestFingerprint: proposal.requestFingerprint,
    operationKey: proposal.operationKey,
    expectedRecurringTotal: new Prisma.Decimal(proposal.expectedRecurringTotal).toFixed(2),
    billingAnchorDate: proposal.billingAnchorDate.toISOString(),
    nextBillingDate: proposal.nextBillingDate.toISOString(),
    currency: proposal.currency.toUpperCase(),
    billingIntervalMonths: proposal.billingIntervalMonths,
    actions: proposal.actions.map((action) => ({
      kind: action.kind,
      fingerprint: action.fingerprint,
      externalSubscriptionItemId: action.externalSubscriptionItemId,
      externalPriceId: action.externalPriceId,
      fromQuantity: action.fromQuantity,
      toQuantity: action.toQuantity,
      agreedAmountPerCycle: action.agreedAmountPerCycle,
      subscriptionItemIds: [...action.subscriptionItemIds],
    })),
    rateGroups: proposal.rateGroups.map((group) => ({
      fingerprint: group.fingerprint,
      currency: group.currency.toUpperCase(),
      billingIntervalMonths: group.billingIntervalMonths,
      agreedAmountPerCycle: group.agreedAmountPerCycle,
      quantity: group.quantity,
      recurringTotal: group.recurringTotal,
      items: group.items.map((item) => ({
        subscriptionItemId: item.subscriptionItemId,
        subscriptionItemRateId: item.subscriptionItemRateId,
        serviceLabel: item.serviceLabel,
        classification: item.classification,
      })),
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function authorizationPayload(authorization: Omit<CanonicalStripeLiveCanaryAuthorization, "signature">): string {
  return JSON.stringify({
    version: 2,
    authorizationId: authorization.authorizationId,
    operation: authorization.operation,
    operationKey: authorization.operationKey,
    requestFingerprint: authorization.requestFingerprint,
    sourceFingerprint: authorization.sourceFingerprint,
    proposalDigest: authorization.proposalDigest,
    providerContext: authorization.providerContext,
    providerAccountId: authorization.providerAccountId,
    externalSubscriptionId: authorization.externalSubscriptionId,
    approvedByEmail: normalizeEmail(authorization.approvedByEmail),
    customerId: authorization.customerId,
    subscriptionId: authorization.subscriptionId,
    currency: authorization.currency.toUpperCase(),
    recurringAmount: normalizedAmount(authorization.recurringAmount, "Recurring amount"),
    taxAmount: normalizedAmount(authorization.taxAmount, "Tax amount"),
    totalExpectedCharge: normalizedAmount(authorization.totalExpectedCharge, "Total expected charge"),
    billingIntervalMonths: authorization.billingIntervalMonths,
    renewalDate: authorization.renewalDate,
    cancellationProcedure: authorization.cancellationProcedure,
    customerIdentityConfirmed: authorization.customerIdentityConfirmed,
    subscriptionConfirmed: authorization.subscriptionConfirmed,
    chargeConfirmed: authorization.chargeConfirmed,
    minimumChargeConfirmed: authorization.minimumChargeConfirmed,
    renewalConfirmed: authorization.renewalConfirmed,
    cancellationConfirmed: authorization.cancellationConfirmed,
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
  });
}

function approvalSecret(environment: CanonicalStripeLiveCanaryEnvironment): string {
  const secret = required(environment, CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET);
  if (Buffer.byteLength(secret, "utf8") < 32) {
    canaryError("CANARY_APPROVAL_SECRET_WEAK", `${CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET} must contain at least 32 bytes.`);
  }
  return secret;
}

export function signCanonicalStripeLiveCanaryAuthorization(
  authorization: Omit<CanonicalStripeLiveCanaryAuthorization, "signature">,
  environment: CanonicalStripeLiveCanaryEnvironment,
): string {
  return createHmac("sha256", approvalSecret(environment))
    .update(authorizationPayload(authorization))
    .digest("hex");
}

function verifySignature(
  authorization: CanonicalStripeLiveCanaryAuthorization,
  environment: CanonicalStripeLiveCanaryEnvironment,
): void {
  const { signature, ...unsigned } = authorization;
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    canaryError("CANARY_APPROVAL_SIGNATURE_INVALID", "Owner authorization signature is invalid.");
  }
  const expected = signCanonicalStripeLiveCanaryAuthorization(unsigned, environment);
  const suppliedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    canaryError("CANARY_APPROVAL_SIGNATURE_INVALID", "Owner authorization does not match the approved pilot details.");
  }
}

export function assertCanonicalStripeLiveCanaryEnvironment(
  environment: CanonicalStripeLiveCanaryEnvironment = process.env,
): void {
  if (environment.NODE_ENV !== "production" || environment.VERCEL_ENV !== "production") {
    canaryError("CANARY_PRODUCTION_CONTEXT_REQUIRED", "Live Stripe canary execution requires the Vercel Production context.");
  }
  if (environment.CANONICAL_STRIPE_LIVE_CANARY_ENABLED !== "true") {
    canaryError("CANARY_FEATURE_DISABLED", `${CANONICAL_STRIPE_LIVE_CANARY_FLAG}=true is required.`);
  }
  required(environment, CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID);
  required(environment, CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID);
  const accountId = required(environment, CANONICAL_STRIPE_LIVE_CANARY_ACCOUNT_ID);
  if (!accountId.startsWith("acct_")) {
    canaryError("CANARY_ACCOUNT_INVALID", `${CANONICAL_STRIPE_LIVE_CANARY_ACCOUNT_ID} must be an explicit Stripe account ID.`);
  }
  const ownerEmail = required(environment, CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL);
  if (!ownerEmail.includes("@")) canaryError("CANARY_OWNER_INVALID", "The live canary owner email is invalid.");
  approvalSecret(environment);
  const key = required(environment, "STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_live_") && !key.startsWith("rk_live_")) {
    canaryError("CANARY_LIVE_KEY_REQUIRED", "The existing Stripe credential must be explicitly live mode for a live canary.");
  }
  const webhookSecret = required(environment, "STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret.startsWith("whsec_")) {
    canaryError("CANARY_WEBHOOK_SECRET_REQUIRED", "The existing signed Stripe webhook endpoint is required.");
  }
}

export function assertCanonicalStripeLiveCanaryAuthorization(input: {
  proposal: CanonicalStripeOperationProposal;
  authorization: CanonicalStripeLiveCanaryAuthorization;
  expectedOperation?: CanonicalStripeLiveCanaryAuthorizedOperation;
  externalSubscriptionId?: string | null;
  environment?: CanonicalStripeLiveCanaryEnvironment;
  now?: Date;
}): void {
  const environment = input.environment ?? process.env;
  assertCanonicalStripeLiveCanaryEnvironment(environment);
  const authorization = input.authorization;
  verifySignature(authorization, environment);

  const expectedOperation = input.expectedOperation ?? "activate_subscription";
  if (authorization.operation !== expectedOperation) {
    canaryError("CANARY_OPERATION_NOT_AUTHORIZED", "The signed owner authorization does not permit this provider mutation.");
  }
  if (input.proposal.kind !== "activation") {
    canaryError("CANARY_ACTIVATION_ONLY", "The initial live canary permits one activation only, not provider synchronization.");
  }
  const allowedCustomerId = required(environment, CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID);
  const allowedSubscriptionId = required(environment, CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID);
  const allowedAccountId = required(environment, CANONICAL_STRIPE_LIVE_CANARY_ACCOUNT_ID);
  if (
    input.proposal.customerId !== allowedCustomerId
    || authorization.customerId !== allowedCustomerId
    || input.proposal.subscriptionId !== allowedSubscriptionId
    || authorization.subscriptionId !== allowedSubscriptionId
  ) {
    canaryError("CANARY_IDENTITY_NOT_AUTHORIZED", "The customer and subscription do not match the exact canary allowlist.");
  }
  if (
    authorization.operationKey !== input.proposal.operationKey
    || authorization.requestFingerprint !== input.proposal.requestFingerprint
    || authorization.sourceFingerprint !== input.proposal.sourceFingerprint
    || authorization.proposalDigest !== canonicalStripeLiveCanaryProposalDigest(input.proposal)
  ) {
    canaryError("CANARY_OPERATION_BINDING_MISMATCH", "The provider request does not exactly match the signed canonical operation.");
  }
  if (
    authorization.providerContext !== LIVE_CANARY_PROVIDER_CONTEXT
    || authorization.providerAccountId !== allowedAccountId
  ) {
    canaryError("CANARY_PROVIDER_CONTEXT_MISMATCH", "The signed authorization does not match the approved live Stripe provider context.");
  }
  const expectedExternalSubscriptionId = input.externalSubscriptionId ?? null;
  if (authorization.externalSubscriptionId !== expectedExternalSubscriptionId) {
    canaryError("CANARY_PROVIDER_SUBSCRIPTION_MISMATCH", "The signed authorization does not match the exact provider subscription.");
  }
  if (expectedOperation === "activate_subscription" && authorization.externalSubscriptionId !== null) {
    canaryError("CANARY_ACTIVATION_PROVIDER_REFERENCE_FORBIDDEN", "Activation authorization cannot pre-authorize an existing provider subscription.");
  }
  if (expectedOperation === "cancel_subscription_at_period_end" && !authorization.externalSubscriptionId) {
    canaryError("CANARY_PROVIDER_SUBSCRIPTION_REQUIRED", "Cancellation authorization must name the exact provider subscription.");
  }
  if (normalizeEmail(authorization.approvedByEmail) !== normalizeEmail(required(environment, CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL))) {
    canaryError("CANARY_OWNER_MISMATCH", "The authorization was not issued by the configured pilot owner.");
  }
  if (authorization.currency.toUpperCase() !== LIVE_CANARY_CURRENCY || input.proposal.currency !== LIVE_CANARY_CURRENCY) {
    canaryError("CANARY_CURRENCY_NOT_AUTHORIZED", "The live canary is restricted to XCD; currency substitution is forbidden.");
  }
  if (authorization.billingIntervalMonths !== 1 || input.proposal.billingIntervalMonths !== 1) {
    canaryError("CANARY_MONTHLY_ONLY", "The live canary is restricted to monthly billing.");
  }
  const recurringAmount = normalizedAmount(authorization.recurringAmount, "Recurring amount");
  const taxAmount = normalizedAmount(authorization.taxAmount, "Tax amount");
  const total = normalizedAmount(authorization.totalExpectedCharge, "Total expected charge");
  if (!new Prisma.Decimal(recurringAmount).equals(input.proposal.expectedRecurringTotal)) {
    canaryError("CANARY_RECURRING_AMOUNT_MISMATCH", "The approved recurring amount does not match canonical pricing.");
  }
  if (!new Prisma.Decimal(taxAmount).isZero()) {
    canaryError("CANARY_TAX_NOT_SUPPORTED", "The initial canary requires an explicit zero tax amount; taxes may not be added silently.");
  }
  if (!new Prisma.Decimal(recurringAmount).plus(taxAmount).equals(total)) {
    canaryError("CANARY_TOTAL_MISMATCH", "The approved total must equal the recurring price plus approved tax.");
  }
  const cap = liveCanaryMaxRecurringAmount(environment);
  if (new Prisma.Decimal(total).lessThanOrEqualTo(0) || new Prisma.Decimal(total).greaterThan(cap)) {
    canaryError("CANARY_CHARGE_CAP_EXCEEDED", `The live canary charge must be greater than zero and no more than EC$${cap}.`);
  }
  if (authorization.renewalDate !== input.proposal.nextBillingDate.toISOString().slice(0, 10)) {
    canaryError("CANARY_RENEWAL_MISMATCH", "The owner-approved renewal date does not match the preserved canonical anniversary.");
  }
  if (authorization.cancellationProcedure !== "cancel_at_period_end_and_verify") {
    canaryError("CANARY_CANCELLATION_PROCEDURE_REQUIRED", "The approved cancellation and verification procedure is required.");
  }
  if (![
    authorization.customerIdentityConfirmed,
    authorization.subscriptionConfirmed,
    authorization.chargeConfirmed,
    authorization.minimumChargeConfirmed,
    authorization.renewalConfirmed,
    authorization.cancellationConfirmed,
  ].every(Boolean)) {
    canaryError("CANARY_CONFIRMATIONS_INCOMPLETE", "Every owner canary confirmation must be explicit.");
  }
  const issuedAt = new Date(authorization.issuedAt);
  const expiresAt = new Date(authorization.expiresAt);
  const now = input.now ?? new Date();
  if (!authorization.authorizationId.trim() || Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    canaryError("CANARY_APPROVAL_TIME_INVALID", "The owner authorization identity or validity window is invalid.");
  }
  if (
    issuedAt.getTime() > now.getTime()
    || expiresAt.getTime() <= now.getTime()
    || expiresAt.getTime() - issuedAt.getTime() > LIVE_CANARY_AUTHORIZATION_MAX_AGE_MS
  ) {
    canaryError("CANARY_APPROVAL_EXPIRED", "The live canary requires a current owner authorization no older than 24 hours.");
  }
}

/**
 * Builds and signs the owner authorization for one operation, then independently verifies it
 * before returning. The CALLER must have collected every owner confirmation (typed prompts in
 * the runner, checkboxes plus a typed word on the screen); this function records them as given.
 * The signing secret never leaves the process environment.
 */
export function buildSignedCanonicalStripeLiveCanaryAuthorization(input: {
  proposal: CanonicalStripeOperationProposal;
  operation: CanonicalStripeLiveCanaryAuthorizedOperation;
  externalSubscriptionId: string | null;
  environment: CanonicalStripeLiveCanaryEnvironment;
  now?: Date;
}): CanonicalStripeLiveCanaryAuthorization {
  const { proposal, environment } = input;
  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + LIVE_CANARY_AUTHORIZATION_MAX_AGE_MS - 60_000);
  const unsigned: Omit<CanonicalStripeLiveCanaryAuthorization, "signature"> = {
    authorizationId: randomUUID(),
    operation: input.operation,
    operationKey: proposal.operationKey,
    requestFingerprint: proposal.requestFingerprint,
    sourceFingerprint: proposal.sourceFingerprint,
    proposalDigest: canonicalStripeLiveCanaryProposalDigest(proposal),
    providerContext: LIVE_CANARY_PROVIDER_CONTEXT,
    providerAccountId: required(environment, CANONICAL_STRIPE_LIVE_CANARY_ACCOUNT_ID),
    externalSubscriptionId: input.externalSubscriptionId,
    approvedByEmail: required(environment, CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL),
    customerId: proposal.customerId,
    subscriptionId: proposal.subscriptionId,
    currency: proposal.currency,
    recurringAmount: proposal.expectedRecurringTotal,
    taxAmount: "0.00",
    totalExpectedCharge: proposal.expectedRecurringTotal,
    billingIntervalMonths: proposal.billingIntervalMonths,
    renewalDate: proposal.nextBillingDate.toISOString().slice(0, 10),
    cancellationProcedure: "cancel_at_period_end_and_verify",
    customerIdentityConfirmed: true,
    subscriptionConfirmed: true,
    chargeConfirmed: true,
    minimumChargeConfirmed: true,
    renewalConfirmed: true,
    cancellationConfirmed: true,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const authorization: CanonicalStripeLiveCanaryAuthorization = {
    ...unsigned,
    signature: signCanonicalStripeLiveCanaryAuthorization(unsigned, environment),
  };
  assertCanonicalStripeLiveCanaryAuthorization({
    proposal,
    authorization,
    expectedOperation: input.operation,
    externalSubscriptionId: input.externalSubscriptionId,
    environment,
    now: issuedAt,
  });
  return authorization;
}

export function asCanonicalStripeLiveCanaryProposal(
  proposal: CanonicalStripeOperationProposal,
): CanonicalStripeOperationProposal {
  const operationKey = `canonical-stripe-live-canary:${proposal.subscriptionId}:${proposal.requestFingerprint}`;
  const confirmationToken = createHmac("sha256", "tl-canonical-live-canary-confirmation-v1")
    .update(`${operationKey}:${proposal.requestFingerprint}`)
    .digest("hex");
  return { ...proposal, operationKey, confirmationToken };
}
