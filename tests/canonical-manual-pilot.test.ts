import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertCanonicalManualPilotAuthorization,
  assertCanonicalManualPilotMigrationAuthorization,
  canonicalManualPilotBillingAuthorized,
  canonicalManualPilotProposalFingerprint,
  CanonicalManualPilotError,
  signCanonicalManualPilotAuthorization,
  signCanonicalManualPilotMigrationAuthorization,
  type CanonicalManualPilotAuthorization,
  type CanonicalManualPilotEnvironment,
  type CanonicalManualPilotMigrationAuthorization,
  type CanonicalManualPilotProposal,
} from "../lib/domain/canonical-manual-pilot";
import type { CanonicalMigrationPlan } from "../lib/domain/canonical-subscription-migration";

const environment: CanonicalManualPilotEnvironment = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  CANONICAL_MANUAL_PILOT_ENABLED: "true",
  CANONICAL_MANUAL_PILOT_CUSTOMER_ID: "customer-1",
  CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID: "subscription-1",
  CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID: "schedule-1",
  CANONICAL_MANUAL_PILOT_OWNER_EMAIL: "owner@example.com",
  CANONICAL_MANUAL_PILOT_APPROVAL_SECRET: "phase-4a-test-secret-that-is-at-least-32-bytes-long",
};

const proposal: CanonicalManualPilotProposal = {
  activationKey: "manual-pilot:migration-1:2026-11-01",
  migrationLedgerId: "ledger-1",
  migrationKey: "migration-1",
  customerId: "customer-1",
  subscriptionId: "subscription-1",
  sourceKind: "manual_schedule",
  legacyScheduleId: "schedule-1",
  sourceInvoiceId: null,
  migrationSourceFingerprint: "source-fingerprint",
  migrationPlanFingerprint: "plan-fingerprint",
  sourceStateFingerprint: "state-fingerprint",
  cutoverPeriodStart: "2026-11-01",
  billingIntervalMonths: 1,
  currency: "XCD",
  recurringAmount: "70.00",
  itemCount: 3,
  assignmentIds: ["assignment-3", "assignment-1", "assignment-2"],
  outstandingBalance: "50.00",
  outstandingInvoiceIds: ["invoice-1"],
};

function activationAuthorization(
  overrides: Partial<Omit<CanonicalManualPilotAuthorization, "signature">> = {},
): CanonicalManualPilotAuthorization {
  const unsigned: Omit<CanonicalManualPilotAuthorization, "signature"> = {
    authorizationId: "authorization-1",
    operation: "activate_manual_pilot",
    proposalFingerprint: canonicalManualPilotProposalFingerprint(proposal),
    approvedByEmail: "owner@example.com",
    customerId: proposal.customerId,
    subscriptionId: proposal.subscriptionId,
    migrationKey: proposal.migrationKey,
    sourceKind: proposal.sourceKind,
    legacyScheduleId: proposal.legacyScheduleId,
    sourceInvoiceId: proposal.sourceInvoiceId,
    sourceStateFingerprint: proposal.sourceStateFingerprint,
    cutoverPeriodStart: proposal.cutoverPeriodStart,
    billingIntervalMonths: proposal.billingIntervalMonths,
    currency: proposal.currency,
    recurringAmount: proposal.recurringAmount,
    approvalReason: "Owner reviewed the exact synthetic pilot.",
    customerIdentityConfirmed: true,
    commercialTermsConfirmed: true,
    historicalBalancesConfirmed: true,
    legacyScheduleStopConfirmed: true,
    canonicalScheduleStartConfirmed: true,
    recoveryProcedureConfirmed: true,
    issuedAt: "2026-10-16T12:00:00.000Z",
    expiresAt: "2026-10-17T12:00:00.000Z",
    ...overrides,
  };
  return {
    ...unsigned,
    signature: signCanonicalManualPilotAuthorization(unsigned, environment),
  };
}

test("manual pilot authorization is bound to exact terms, source state, owner and validity window", () => {
  const authorization = activationAuthorization();
  assert.doesNotThrow(() => assertCanonicalManualPilotAuthorization({
    proposal,
    authorization,
    environment,
    now: new Date("2026-10-16T13:00:00.000Z"),
  }));

  assert.throws(() => assertCanonicalManualPilotAuthorization({
    proposal,
    authorization: { ...authorization, recurringAmount: "71.00" },
    environment,
    now: new Date("2026-10-16T13:00:00.000Z"),
  }), (error: unknown) => error instanceof CanonicalManualPilotError
    && error.code === "PILOT_APPROVAL_SIGNATURE_INVALID");

  const expired = activationAuthorization({
    issuedAt: "2026-10-14T12:00:00.000Z",
    expiresAt: "2026-10-15T12:00:00.000Z",
  });
  assert.throws(() => assertCanonicalManualPilotAuthorization({
    proposal,
    authorization: expired,
    environment,
    now: new Date("2026-10-16T13:00:00.000Z"),
  }), (error: unknown) => error instanceof CanonicalManualPilotError
    && error.code === "PILOT_APPROVAL_EXPIRED");
});

const migrationPlan: CanonicalMigrationPlan = {
  schemaVersion: "phase-2b-plan-v1",
  sourceSchemaVersion: "phase-2a-source-v1",
  analysisDate: "2026-10-16",
  sourceFingerprint: "snapshot-fingerprint",
  planFingerprint: "plan-fingerprint",
  awaitingApproval: [],
  entries: [{
    migrationKey: "migration-1",
    sourceFingerprint: "source-fingerprint",
    sourceKind: "manual_schedule",
    sourceId: "schedule-1",
    proposalId: "schedule:schedule-1",
    customerId: "customer-1",
    sourceReviewStatus: "needs_confirmation",
    sourceCycleAmount: "70.00",
    proposedCycleAmount: "70.00",
    approvedBy: "owner@example.com",
    approvedAt: "2026-10-16T12:00:00.000Z",
    approvalReason: "Reviewed synthetic plan.",
    resolvedIssues: [],
    target: {
      name: "Pilot subscription",
      reference: "pilot-1",
      collectionMethod: "manual_invoice",
      lifecycleStatus: "active",
      billingIntervalMonths: 1,
      currency: "XCD",
      commercialStartDate: "2026-01-01",
      billingAnchorDate: "2026-11-01",
      nextBillingDate: "2026-11-01",
      gracePeriodDays: 7,
      defaultItemAmountPerCycle: "25.00",
      expectedTotalAmountPerCycle: "70.00",
      items: [],
      providerRelationship: null,
    },
    historicalReferences: {
      assignmentIds: [],
      invoiceIds: [],
      billingInvoiceIds: [],
      paymentIds: [],
    },
  }],
};

function migrationAuthorization(): CanonicalManualPilotMigrationAuthorization {
  const unsigned: Omit<CanonicalManualPilotMigrationAuthorization, "signature"> = {
    authorizationId: "migration-authorization-1",
    operation: "migrate_manual_pilot_shadow",
    customerId: "customer-1",
    targetSubscriptionId: "subscription-1",
    sourceKind: "manual_schedule",
    legacyScheduleId: "schedule-1",
    sourceInvoiceId: null,
    migrationKey: "migration-1",
    migrationSourceFingerprint: "source-fingerprint",
    migrationPlanFingerprint: "plan-fingerprint",
    currency: "XCD",
    billingIntervalMonths: 1,
    recurringAmount: "70.00",
    cutoverPeriodStart: "2026-11-01",
    approvedByEmail: "owner@example.com",
    approvalReason: "Owner approved one synthetic shadow migration.",
    customerIdentityConfirmed: true,
    commercialTermsConfirmed: true,
    sourceScheduleConfirmed: true,
    historicalBalancesConfirmed: true,
    issuedAt: "2026-10-16T12:00:00.000Z",
    expiresAt: "2026-10-17T12:00:00.000Z",
  };
  return {
    ...unsigned,
    signature: signCanonicalManualPilotMigrationAuthorization(unsigned, environment),
  };
}

test("production shadow migration requires one exact signed plan and preselected target ID", () => {
  const authorization = migrationAuthorization();
  assert.doesNotThrow(() => assertCanonicalManualPilotMigrationAuthorization({
    plan: migrationPlan,
    authorization,
    environment,
    now: new Date("2026-10-16T13:00:00.000Z"),
  }));
  assert.throws(() => assertCanonicalManualPilotMigrationAuthorization({
    plan: { ...migrationPlan, planFingerprint: "changed" },
    authorization,
    environment,
    now: new Date("2026-10-16T13:00:00.000Z"),
  }), (error: unknown) => error instanceof CanonicalManualPilotError
    && error.code === "PILOT_APPROVAL_BINDING_MISMATCH");
});

test("production recurring scope needs exact allowlist and an active durable activation", () => {
  assert.equal(canonicalManualPilotBillingAuthorized({
    customerId: "customer-1",
    subscriptionId: "subscription-1",
    activationStatus: "active",
    environment,
  }), true);
  assert.equal(canonicalManualPilotBillingAuthorized({
    customerId: "customer-1",
    subscriptionId: "subscription-2",
    activationStatus: "active",
    environment,
  }), false);
  assert.equal(canonicalManualPilotBillingAuthorized({
    customerId: "customer-1",
    subscriptionId: "subscription-1",
    activationStatus: "approved",
    environment,
  }), false);
  assert.equal(canonicalManualPilotBillingAuthorized({
    customerId: "customer-1",
    subscriptionId: "subscription-1",
    activationStatus: "active",
    environment: { ...environment, CANONICAL_MANUAL_PILOT_ENABLED: "false" },
  }), false);
});
