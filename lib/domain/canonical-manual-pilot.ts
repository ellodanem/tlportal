import { createHmac, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  migrationFingerprint,
  type CanonicalMigrationPlan,
} from "./canonical-subscription-migration";

export const CANONICAL_MANUAL_PILOT_FLAG = "CANONICAL_MANUAL_PILOT_ENABLED";
export const CANONICAL_MANUAL_PILOT_CUSTOMER_ID = "CANONICAL_MANUAL_PILOT_CUSTOMER_ID";
export const CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID = "CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID";
export const CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID = "CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID";
export const CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID = "CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID";
export const CANONICAL_MANUAL_PILOT_OWNER_EMAIL = "CANONICAL_MANUAL_PILOT_OWNER_EMAIL";
export const CANONICAL_MANUAL_PILOT_APPROVAL_SECRET = "CANONICAL_MANUAL_PILOT_APPROVAL_SECRET";
export const MANUAL_PILOT_AUTHORIZATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CanonicalManualPilotEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  CANONICAL_MANUAL_PILOT_ENABLED?: string;
  CANONICAL_MANUAL_PILOT_CUSTOMER_ID?: string;
  CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID?: string;
  CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID?: string;
  CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID?: string;
  CANONICAL_MANUAL_PILOT_OWNER_EMAIL?: string;
  CANONICAL_MANUAL_PILOT_APPROVAL_SECRET?: string;
};

export type CanonicalManualPilotMigrationAuthorization = {
  authorizationId: string;
  operation: "migrate_manual_pilot_shadow";
  customerId: string;
  targetSubscriptionId: string;
  sourceKind: "manual_schedule" | "manual_invoice";
  legacyScheduleId: string | null;
  sourceInvoiceId: string | null;
  migrationKey: string;
  migrationSourceFingerprint: string;
  migrationPlanFingerprint: string;
  currency: string;
  billingIntervalMonths: number;
  recurringAmount: string;
  cutoverPeriodStart: string;
  approvedByEmail: string;
  approvalReason: string;
  customerIdentityConfirmed: boolean;
  commercialTermsConfirmed: boolean;
  sourceScheduleConfirmed: boolean;
  historicalBalancesConfirmed: boolean;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

export type CanonicalManualPilotProposal = {
  activationKey: string;
  migrationLedgerId: string;
  migrationKey: string;
  customerId: string;
  subscriptionId: string;
  sourceKind: "manual_schedule" | "manual_invoice";
  legacyScheduleId: string | null;
  sourceInvoiceId: string | null;
  migrationSourceFingerprint: string;
  migrationPlanFingerprint: string;
  sourceStateFingerprint: string;
  cutoverPeriodStart: string;
  billingIntervalMonths: 1 | 3 | 6 | 12;
  currency: string;
  recurringAmount: string;
  itemCount: number;
  assignmentIds: string[];
  outstandingBalance: string;
  outstandingInvoiceIds: string[];
};

export type CanonicalManualPilotAuthorization = {
  authorizationId: string;
  operation: "activate_manual_pilot";
  proposalFingerprint: string;
  approvedByEmail: string;
  customerId: string;
  subscriptionId: string;
  migrationKey: string;
  sourceKind: "manual_schedule" | "manual_invoice";
  legacyScheduleId: string | null;
  sourceInvoiceId: string | null;
  sourceStateFingerprint: string;
  cutoverPeriodStart: string;
  billingIntervalMonths: number;
  currency: string;
  recurringAmount: string;
  approvalReason: string;
  customerIdentityConfirmed: boolean;
  commercialTermsConfirmed: boolean;
  historicalBalancesConfirmed: boolean;
  legacyScheduleStopConfirmed: boolean;
  canonicalScheduleStartConfirmed: boolean;
  recoveryProcedureConfirmed: boolean;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

export class CanonicalManualPilotError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalManualPilotError";
    this.code = code;
  }
}

function pilotError(code: string, message: string): never {
  throw new CanonicalManualPilotError(code, message);
}

function required(
  environment: CanonicalManualPilotEnvironment,
  key: keyof CanonicalManualPilotEnvironment,
): string {
  const value = environment[key]?.trim();
  if (!value) pilotError("PILOT_CONFIGURATION_MISSING", `${key} is required for a manual pilot.`);
  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMoney(value: string, label: string): string {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    pilotError("PILOT_AMOUNT_INVALID", `${label} must be a valid decimal amount.`);
  }
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
    pilotError("PILOT_AMOUNT_INVALID", `${label} must be non-negative with at most two decimal places.`);
  }
  return amount.toFixed(2);
}

function normalizeDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    pilotError("PILOT_DATE_INVALID", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    pilotError("PILOT_DATE_INVALID", `${label} is invalid.`);
  }
  return value;
}

function normalizedProposal(proposal: CanonicalManualPilotProposal) {
  return {
    version: 1,
    activationKey: proposal.activationKey,
    migrationLedgerId: proposal.migrationLedgerId,
    migrationKey: proposal.migrationKey,
    customerId: proposal.customerId,
    subscriptionId: proposal.subscriptionId,
    sourceKind: proposal.sourceKind,
    legacyScheduleId: proposal.legacyScheduleId,
    sourceInvoiceId: proposal.sourceInvoiceId,
    migrationSourceFingerprint: proposal.migrationSourceFingerprint,
    migrationPlanFingerprint: proposal.migrationPlanFingerprint,
    sourceStateFingerprint: proposal.sourceStateFingerprint,
    cutoverPeriodStart: normalizeDate(proposal.cutoverPeriodStart, "Cutover period"),
    billingIntervalMonths: proposal.billingIntervalMonths,
    currency: proposal.currency.trim().toUpperCase(),
    recurringAmount: normalizeMoney(proposal.recurringAmount, "Recurring amount"),
    itemCount: proposal.itemCount,
    assignmentIds: [...proposal.assignmentIds].sort(),
    outstandingBalance: normalizeMoney(proposal.outstandingBalance, "Outstanding balance"),
    outstandingInvoiceIds: [...proposal.outstandingInvoiceIds].sort(),
  };
}

export function canonicalManualPilotProposalFingerprint(
  proposal: CanonicalManualPilotProposal,
): string {
  return migrationFingerprint(normalizedProposal(proposal));
}

function unsignedAuthorizationPayload(
  authorization: Omit<CanonicalManualPilotAuthorization, "signature">,
): string {
  return JSON.stringify({
    version: 1,
    authorizationId: authorization.authorizationId,
    operation: authorization.operation,
    proposalFingerprint: authorization.proposalFingerprint,
    approvedByEmail: normalizeEmail(authorization.approvedByEmail),
    customerId: authorization.customerId,
    subscriptionId: authorization.subscriptionId,
    migrationKey: authorization.migrationKey,
    sourceKind: authorization.sourceKind,
    legacyScheduleId: authorization.legacyScheduleId,
    sourceInvoiceId: authorization.sourceInvoiceId,
    sourceStateFingerprint: authorization.sourceStateFingerprint,
    cutoverPeriodStart: normalizeDate(authorization.cutoverPeriodStart, "Cutover period"),
    billingIntervalMonths: authorization.billingIntervalMonths,
    currency: authorization.currency.trim().toUpperCase(),
    recurringAmount: normalizeMoney(authorization.recurringAmount, "Recurring amount"),
    approvalReason: authorization.approvalReason.trim(),
    customerIdentityConfirmed: authorization.customerIdentityConfirmed,
    commercialTermsConfirmed: authorization.commercialTermsConfirmed,
    historicalBalancesConfirmed: authorization.historicalBalancesConfirmed,
    legacyScheduleStopConfirmed: authorization.legacyScheduleStopConfirmed,
    canonicalScheduleStartConfirmed: authorization.canonicalScheduleStartConfirmed,
    recoveryProcedureConfirmed: authorization.recoveryProcedureConfirmed,
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
  });
}

function approvalSecret(environment: CanonicalManualPilotEnvironment): string {
  const secret = required(environment, CANONICAL_MANUAL_PILOT_APPROVAL_SECRET);
  if (Buffer.byteLength(secret, "utf8") < 32) {
    pilotError(
      "PILOT_APPROVAL_SECRET_WEAK",
      `${CANONICAL_MANUAL_PILOT_APPROVAL_SECRET} must contain at least 32 bytes.`,
    );
  }
  return secret;
}

function unsignedMigrationAuthorizationPayload(
  authorization: Omit<CanonicalManualPilotMigrationAuthorization, "signature">,
): string {
  return JSON.stringify({
    version: 1,
    authorizationId: authorization.authorizationId,
    operation: authorization.operation,
    customerId: authorization.customerId,
    targetSubscriptionId: authorization.targetSubscriptionId,
    sourceKind: authorization.sourceKind,
    legacyScheduleId: authorization.legacyScheduleId,
    sourceInvoiceId: authorization.sourceInvoiceId,
    migrationKey: authorization.migrationKey,
    migrationSourceFingerprint: authorization.migrationSourceFingerprint,
    migrationPlanFingerprint: authorization.migrationPlanFingerprint,
    currency: authorization.currency.trim().toUpperCase(),
    billingIntervalMonths: authorization.billingIntervalMonths,
    recurringAmount: normalizeMoney(authorization.recurringAmount, "Recurring amount"),
    cutoverPeriodStart: normalizeDate(authorization.cutoverPeriodStart, "Cutover period"),
    approvedByEmail: normalizeEmail(authorization.approvedByEmail),
    approvalReason: authorization.approvalReason.trim(),
    customerIdentityConfirmed: authorization.customerIdentityConfirmed,
    commercialTermsConfirmed: authorization.commercialTermsConfirmed,
    sourceScheduleConfirmed: authorization.sourceScheduleConfirmed,
    historicalBalancesConfirmed: authorization.historicalBalancesConfirmed,
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
  });
}

export function signCanonicalManualPilotMigrationAuthorization(
  authorization: Omit<CanonicalManualPilotMigrationAuthorization, "signature">,
  environment: CanonicalManualPilotEnvironment,
): string {
  return createHmac("sha256", approvalSecret(environment))
    .update(unsignedMigrationAuthorizationPayload(authorization))
    .digest("hex");
}

export function assertCanonicalManualPilotMigrationAuthorization(input: {
  plan: CanonicalMigrationPlan;
  authorization: CanonicalManualPilotMigrationAuthorization;
  environment?: CanonicalManualPilotEnvironment;
  now?: Date;
}): void {
  const environment = input.environment ?? process.env;
  if (environment.CANONICAL_MANUAL_PILOT_ENABLED !== "true") {
    pilotError("PILOT_FEATURE_DISABLED", `${CANONICAL_MANUAL_PILOT_FLAG}=true is required.`);
  }
  if (input.plan.entries.length !== 1) {
    pilotError("PILOT_SINGLE_SUBSCRIPTION_REQUIRED", "A manual pilot migration must contain exactly one approved arrangement.");
  }
  const entry = input.plan.entries[0];
  const authorization = input.authorization;
  const allowedCustomerId = required(environment, CANONICAL_MANUAL_PILOT_CUSTOMER_ID);
  const allowedSubscriptionId = required(environment, CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID);
  const ownerEmail = required(environment, CANONICAL_MANUAL_PILOT_OWNER_EMAIL);
  if (!/^[a-f0-9]{64}$/i.test(authorization.signature)) {
    pilotError("PILOT_APPROVAL_SIGNATURE_INVALID", "Owner migration authorization signature is invalid.");
  }
  const { signature, ...unsigned } = authorization;
  const expected = signCanonicalManualPilotMigrationAuthorization(unsigned, environment);
  const suppliedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    pilotError("PILOT_APPROVAL_SIGNATURE_INVALID", "Owner migration authorization does not match the reviewed plan.");
  }
  if (authorization.operation !== "migrate_manual_pilot_shadow") {
    pilotError("PILOT_OPERATION_NOT_AUTHORIZED", "Authorization does not permit shadow migration.");
  }
  const sourceIsSchedule = authorization.sourceKind === "manual_schedule";
  const allowedSourceId = sourceIsSchedule
    ? required(environment, CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID)
    : required(environment, CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID);
  const authorizedSourceId = sourceIsSchedule ? authorization.legacyScheduleId : authorization.sourceInvoiceId;
  if (
    entry.sourceKind !== authorization.sourceKind
    || entry.target.collectionMethod !== "manual_invoice"
    || entry.customerId !== allowedCustomerId
    || authorization.customerId !== allowedCustomerId
    || authorization.targetSubscriptionId !== allowedSubscriptionId
    || entry.sourceId !== allowedSourceId
    || authorizedSourceId !== allowedSourceId
    || (sourceIsSchedule && authorization.sourceInvoiceId != null)
    || (!sourceIsSchedule && authorization.legacyScheduleId != null)
  ) {
    pilotError("PILOT_IDENTITY_NOT_AUTHORIZED", "Migration does not match the exact customer, target subscription, and approved manual billing source.");
  }
  if (normalizeEmail(authorization.approvedByEmail) !== normalizeEmail(ownerEmail)) {
    pilotError("PILOT_OWNER_MISMATCH", "Migration authorization was not issued by the configured pilot owner.");
  }
  if (
    authorization.migrationKey !== entry.migrationKey
    || authorization.migrationSourceFingerprint !== entry.sourceFingerprint
    || authorization.migrationPlanFingerprint !== input.plan.planFingerprint
  ) {
    pilotError("PILOT_APPROVAL_BINDING_MISMATCH", "Migration authorization does not match the immutable Phase 2B plan.");
  }
  if (
    authorization.currency.toUpperCase() !== entry.target.currency.toUpperCase()
    || authorization.billingIntervalMonths !== entry.target.billingIntervalMonths
    || normalizeMoney(authorization.recurringAmount, "Recurring amount") !== normalizeMoney(entry.target.expectedTotalAmountPerCycle, "Recurring amount")
    || authorization.cutoverPeriodStart !== entry.target.nextBillingDate
  ) {
    pilotError("PILOT_TERMS_MISMATCH", "Migration authorization does not match the approved commercial terms and cutover period.");
  }
  if (!authorization.authorizationId.trim() || !authorization.approvalReason.trim()) {
    pilotError("PILOT_APPROVAL_INCOMPLETE", "Migration authorization identity and reason are required.");
  }
  if (![
    authorization.customerIdentityConfirmed,
    authorization.commercialTermsConfirmed,
    authorization.sourceScheduleConfirmed,
    authorization.historicalBalancesConfirmed,
  ].every(Boolean)) {
    pilotError("PILOT_CONFIRMATIONS_INCOMPLETE", "Every shadow-migration confirmation must be explicit.");
  }
  const issuedAt = new Date(authorization.issuedAt);
  const expiresAt = new Date(authorization.expiresAt);
  const now = input.now ?? new Date();
  if (
    Number.isNaN(issuedAt.getTime())
    || Number.isNaN(expiresAt.getTime())
    || issuedAt.getTime() > now.getTime()
    || expiresAt.getTime() <= now.getTime()
    || expiresAt.getTime() - issuedAt.getTime() > MANUAL_PILOT_AUTHORIZATION_MAX_AGE_MS
  ) {
    pilotError("PILOT_APPROVAL_EXPIRED", "Shadow-migration authorization must be current and no older than 24 hours.");
  }
}

export function signCanonicalManualPilotAuthorization(
  authorization: Omit<CanonicalManualPilotAuthorization, "signature">,
  environment: CanonicalManualPilotEnvironment,
): string {
  return createHmac("sha256", approvalSecret(environment))
    .update(unsignedAuthorizationPayload(authorization))
    .digest("hex");
}

export function canonicalManualPilotApprovalFingerprint(
  authorization: CanonicalManualPilotAuthorization,
): string {
  const { signature: _signature, ...unsigned } = authorization;
  void _signature;
  return migrationFingerprint(JSON.parse(unsignedAuthorizationPayload(unsigned)));
}

function verifySignature(
  authorization: CanonicalManualPilotAuthorization,
  environment: CanonicalManualPilotEnvironment,
): void {
  if (!/^[a-f0-9]{64}$/i.test(authorization.signature)) {
    pilotError("PILOT_APPROVAL_SIGNATURE_INVALID", "Owner authorization signature is invalid.");
  }
  const { signature, ...unsigned } = authorization;
  const expected = signCanonicalManualPilotAuthorization(unsigned, environment);
  const suppliedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    pilotError(
      "PILOT_APPROVAL_SIGNATURE_INVALID",
      "Owner authorization does not match the approved manual pilot details.",
    );
  }
}

export function assertCanonicalManualPilotAuthorization(input: {
  proposal: CanonicalManualPilotProposal;
  authorization: CanonicalManualPilotAuthorization;
  environment?: CanonicalManualPilotEnvironment;
  now?: Date;
}): void {
  const environment = input.environment ?? process.env;
  const authorization = input.authorization;
  if (environment.CANONICAL_MANUAL_PILOT_ENABLED !== "true") {
    pilotError("PILOT_FEATURE_DISABLED", `${CANONICAL_MANUAL_PILOT_FLAG}=true is required.`);
  }

  const allowedCustomerId = required(environment, CANONICAL_MANUAL_PILOT_CUSTOMER_ID);
  const allowedSubscriptionId = required(environment, CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID);
  const ownerEmail = required(environment, CANONICAL_MANUAL_PILOT_OWNER_EMAIL);
  verifySignature(authorization, environment);

  if (authorization.operation !== "activate_manual_pilot") {
    pilotError("PILOT_OPERATION_NOT_AUTHORIZED", "Authorization does not permit manual pilot activation.");
  }
  if (
    input.proposal.customerId !== allowedCustomerId
    || authorization.customerId !== allowedCustomerId
    || input.proposal.subscriptionId !== allowedSubscriptionId
    || authorization.subscriptionId !== allowedSubscriptionId
  ) {
    pilotError("PILOT_IDENTITY_NOT_AUTHORIZED", "Customer and subscription do not match the exact pilot allowlist.");
  }
  if (normalizeEmail(authorization.approvedByEmail) !== normalizeEmail(ownerEmail)) {
    pilotError("PILOT_OWNER_MISMATCH", "Authorization was not issued by the configured pilot owner.");
  }
  if (
    authorization.proposalFingerprint !== canonicalManualPilotProposalFingerprint(input.proposal)
    || authorization.migrationKey !== input.proposal.migrationKey
    || authorization.sourceKind !== input.proposal.sourceKind
    || authorization.legacyScheduleId !== input.proposal.legacyScheduleId
    || authorization.sourceInvoiceId !== input.proposal.sourceInvoiceId
    || authorization.sourceStateFingerprint !== input.proposal.sourceStateFingerprint
  ) {
    pilotError("PILOT_APPROVAL_BINDING_MISMATCH", "Authorization does not match the reviewed migration and source state.");
  }
  if (
    authorization.cutoverPeriodStart !== input.proposal.cutoverPeriodStart
    || authorization.billingIntervalMonths !== input.proposal.billingIntervalMonths
    || authorization.currency.toUpperCase() !== input.proposal.currency.toUpperCase()
    || normalizeMoney(authorization.recurringAmount, "Recurring amount") !== normalizeMoney(input.proposal.recurringAmount, "Recurring amount")
  ) {
    pilotError("PILOT_TERMS_MISMATCH", "Authorization does not match the exact approved commercial terms and cutover period.");
  }
  if (!authorization.authorizationId.trim() || !authorization.approvalReason.trim()) {
    pilotError("PILOT_APPROVAL_INCOMPLETE", "Authorization identity and approval reason are required.");
  }
  if (![
    authorization.customerIdentityConfirmed,
    authorization.commercialTermsConfirmed,
    authorization.historicalBalancesConfirmed,
    authorization.legacyScheduleStopConfirmed,
    authorization.canonicalScheduleStartConfirmed,
    authorization.recoveryProcedureConfirmed,
  ].every(Boolean)) {
    pilotError("PILOT_CONFIRMATIONS_INCOMPLETE", "Every manual pilot confirmation must be explicit.");
  }

  const issuedAt = new Date(authorization.issuedAt);
  const expiresAt = new Date(authorization.expiresAt);
  const now = input.now ?? new Date();
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    pilotError("PILOT_APPROVAL_TIME_INVALID", "Authorization validity dates are invalid.");
  }
  if (
    issuedAt.getTime() > now.getTime()
    || expiresAt.getTime() <= now.getTime()
    || expiresAt.getTime() - issuedAt.getTime() > MANUAL_PILOT_AUTHORIZATION_MAX_AGE_MS
  ) {
    pilotError("PILOT_APPROVAL_EXPIRED", "Manual pilot authorization must be current and no older than 24 hours.");
  }
}

/**
 * Production recurring execution is limited to one exact, durably activated pilot.
 * The general canonical native-billing flag can never satisfy this guard in production.
 */
export function canonicalManualPilotBillingAuthorized(input: {
  customerId: string;
  subscriptionId: string;
  activationStatus: string | null;
  environment?: CanonicalManualPilotEnvironment;
}): boolean {
  const environment = input.environment ?? process.env;
  return environment.NODE_ENV === "production"
    && (environment.VERCEL_ENV == null || environment.VERCEL_ENV === "production")
    && environment.CANONICAL_MANUAL_PILOT_ENABLED === "true"
    && environment.CANONICAL_MANUAL_PILOT_CUSTOMER_ID === input.customerId
    && environment.CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID === input.subscriptionId
    && input.activationStatus === "active";
}
