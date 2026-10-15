import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanonicalMigrationPlanIntegrity,
  CanonicalMigrationPlanningError,
  createCanonicalMigrationPlan,
  MIGRATION_APPROVAL_SCHEMA_VERSION,
  migrationSourceFingerprint,
  type ApprovedArrangementDecision,
  type CanonicalMigrationApproval,
} from "../lib/domain/canonical-subscription-migration";
import {
  analyzeSubscriptionMigration,
  type LegacyAssignment,
  type LegacyBillingSnapshot,
  type LegacyRecurringSchedule,
  type LegacySubscription,
  type SubscriptionMigrationProposal,
} from "../lib/domain/subscription-migration-analysis";
import {
  APPLY_MIGRATION_CONFIRMATION,
  assertLocalMigrationExecutionGuard,
  CanonicalMigrationExecutionError,
} from "../lib/services/canonical-subscription-migration-service";

const PERIOD_START = "2026-10-01T00:00:00.000Z";
const PERIOD_END = "2026-11-01T00:00:00.000Z";

function snapshot(): LegacyBillingSnapshot {
  return {
    schemaVersion: "phase-2a-source-v1",
    analysisDate: "2026-10-15",
    customers: [{ id: "customer-1", billingMode: "stripe_subscription", archivedAt: null }],
    subscriptions: [],
    billingAccounts: [],
    catalogPrices: [{
      id: "catalog-1",
      monthlyRateXcd: "25.00",
      durationMonths: 1,
      isActive: true,
    }],
    inventory: { deviceIds: [], simCardIds: [] },
    assignments: [],
    recurringSchedules: [],
    invoices: [],
    billingInvoices: [],
    payments: [],
  };
}

function subscription(overrides: Partial<LegacySubscription> = {}): LegacySubscription {
  return {
    id: "subscription-1",
    customerId: "customer-1",
    controlMode: "legacy",
    status: "active",
    planTermMonths: 1,
    monthlyRateXcd: "25.00",
    vehicleCount: 1,
    stripeSubscriptionId: "sub_verified_1",
    stripeCustomerId: "cus_verified_1",
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    cancelAt: null,
    agreedAmountPerCycle: null,
    currency: "XCD",
    billingAnchorDate: null,
    nextBillingDate: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<LegacyAssignment> = {}): LegacyAssignment {
  return {
    id: "assignment-1",
    customerId: "customer-1",
    deviceId: "device-1",
    simCardId: null,
    status: "active",
    startDate: PERIOD_START,
    endDate: null,
    intervalMonths: 1,
    nextDueDate: PERIOD_END,
    invoilessRecurringId: null,
    subscriptionItemId: null,
    ...overrides,
  };
}

function schedule(overrides: Partial<LegacyRecurringSchedule> = {}): LegacyRecurringSchedule {
  return {
    id: "schedule-1",
    customerId: "customer-1",
    customerSubscriptionId: null,
    serviceAssignmentId: "assignment-1",
    status: "active",
    intervalMonths: 1,
    currency: "XCD",
    nextIssueDate: PERIOD_END,
    lineItems: [{
      id: "schedule-line-1",
      description: "Tracking service",
      quantity: "1",
      unitPrice: "25.00",
      lineTotal: "25.00",
    }],
    ...overrides,
  };
}

function findProposal(input: LegacyBillingSnapshot, proposalId?: string): SubscriptionMigrationProposal {
  const proposals = analyzeSubscriptionMigration(input).customers.flatMap((customer) => customer.proposals);
  const proposal = proposalId
    ? proposals.find((entry) => entry.proposalId === proposalId)
    : proposals[0];
  assert.ok(proposal, "expected a migration proposal");
  return proposal;
}

function decision(
  input: LegacyBillingSnapshot,
  proposal: SubscriptionMigrationProposal,
  overrides: Partial<ApprovedArrangementDecision> = {},
): ApprovedArrangementDecision {
  const review = analyzeSubscriptionMigration(input).customers.find(
    (customer) => customer.customerId === proposal.customerId,
  );
  assert.ok(review);
  const issueCodes = new Set([
    ...proposal.issues,
    ...review.issues,
  ].filter((issue) => issue.severity === "decision" || issue.severity === "conflict")
    .map((issue) => issue.code));
  const assignmentIds = proposal.proposedItems.map((item) => item.serviceAssignmentId);
  const fallbackAssignments = input.assignments
    .filter((entry) => entry.customerId === proposal.customerId && entry.subscriptionItemId == null)
    .map((entry) => entry.id);
  const approvedAssignments = assignmentIds.length ? assignmentIds : fallbackAssignments.slice(0, 1);
  const cycleAmount = proposal.proposedCycleAmount ?? "275.00";
  const collectionMethod = proposal.collectionMethod ?? "manual_invoice";
  return {
    proposalId: proposal.proposalId,
    approvedBy: "billing-owner",
    approvedAt: "2026-10-15T12:00:00.000Z",
    approvalReason: "Reviewed against sanitized source evidence.",
    name: `Migrated ${proposal.sourceId}`,
    reference: `migration-${proposal.sourceId}`,
    collectionMethod,
    lifecycleStatus: proposal.lifecycleStatus,
    billingIntervalMonths: proposal.billingIntervalMonths as 1 | 3 | 6 | 12,
    currency: proposal.currency || "XCD",
    commercialStartDate: "2026-10-01",
    billingAnchorDate: "2026-10-01",
    nextBillingDate: proposal.nextBillingDate?.slice(0, 10) ?? "2026-11-01",
    gracePeriodDays: 7,
    defaultItemAmountPerCycle: cycleAmount,
    expectedTotalAmountPerCycle: cycleAmount,
    items: [{
      itemKey: `item-${proposal.sourceId}`,
      label: "Tracking service",
      assignmentIds: approvedAssignments,
      serviceActivatedDate: "2026-10-01",
      billingEffectiveFrom: "2026-10-01",
      billingEffectiveUntil: null,
      agreedAmountPerCycle: cycleAmount,
      classification: proposal.pricingAssessment === "negotiated" ? "negotiated" : "standard",
      changeReason: "Initial canonical migration from reviewed legacy evidence.",
    }],
    providerRelationship: collectionMethod === "stripe_autocharge" ? {
      provider: "stripe",
      externalSubscriptionId: proposal.providerSubscriptionId ?? `sub_override_${proposal.sourceId}`,
      providerStatus: "active",
      activatedAt: "2026-10-01T00:00:00.000Z",
      providerItems: [],
    } : null,
    issueResolutions: [...issueCodes].map((code) => ({
      code,
      explanation: `Owner reviewed and resolved ${code}.`,
    })),
    ...overrides,
  };
}

function approval(
  input: LegacyBillingSnapshot,
  decisions: ApprovedArrangementDecision[],
): CanonicalMigrationApproval {
  return {
    schemaVersion: MIGRATION_APPROVAL_SCHEMA_VERSION,
    sourceFingerprint: migrationSourceFingerprint(input),
    decisions,
  };
}

function expectPlanningCode(code: string) {
  return (error: unknown) => error instanceof CanonicalMigrationPlanningError && error.code === code;
}

function standardSnapshot() {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(assignment());
  return input;
}

test("1: a review-ready arrangement is never migrated without explicit approval", () => {
  const input = standardSnapshot();
  const plan = createCanonicalMigrationPlan(input, approval(input, []));
  assert.equal(plan.entries.length, 0);
  assert.equal(plan.awaitingApproval.length, 1);
});

test("2: a reviewed monthly Stripe arrangement produces one deterministic shadow plan", () => {
  const input = standardSnapshot();
  const proposal = findProposal(input);
  const approved = approval(input, [decision(input, proposal)]);
  const first = createCanonicalMigrationPlan(input, approved);
  const second = createCanonicalMigrationPlan(input, approved);
  assert.deepEqual(first, second);
  assert.equal(first.entries[0].target.expectedTotalAmountPerCycle, "25.00");
  assert.equal(first.entries[0].target.providerRelationship?.externalSubscriptionId, "sub_verified_1");
});

test("3: exact annual pricing is retained instead of reconstructed from a monthly formula", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ planTermMonths: 12, agreedAmountPerCycle: "275.00" }));
  input.assignments.push(assignment({ intervalMonths: 12, nextDueDate: "2027-10-01T00:00:00.000Z" }));
  const proposal = findProposal(input);
  const plan = createCanonicalMigrationPlan(input, approval(input, [decision(input, proposal)]));
  assert.equal(plan.entries[0].target.billingIntervalMonths, 12);
  assert.equal(plan.entries[0].target.items[0].agreedAmountPerCycle, "275.00");
});

test("4: missing annual price evidence remains blocked without a documented resolution", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ planTermMonths: 12 }));
  input.assignments.push(assignment({ intervalMonths: 12 }));
  const proposal = findProposal(input);
  const approvedDecision = decision(input, proposal, { issueResolutions: [] });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("UNRESOLVED_REVIEW_ISSUE"),
  );
});

test("5: owner-confirmed annual pricing can be planned with the ambiguity documented", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ planTermMonths: 12 }));
  input.assignments.push(assignment({ intervalMonths: 12 }));
  const proposal = findProposal(input);
  const plan = createCanonicalMigrationPlan(input, approval(input, [decision(input, proposal)]));
  assert.equal(plan.entries[0].sourceReviewStatus, "needs_confirmation");
  assert.equal(plan.entries[0].target.expectedTotalAmountPerCycle, "275.00");
  assert.ok(plan.entries[0].resolvedIssues.length > 0);
});

test("6: a manual recurring schedule is planned without a provider relationship", () => {
  const input = snapshot();
  input.customers[0].billingMode = "manual_legacy";
  input.recurringSchedules.push(schedule());
  input.assignments.push(assignment());
  const proposal = findProposal(input);
  const plan = createCanonicalMigrationPlan(input, approval(input, [decision(input, proposal)]));
  assert.equal(plan.entries[0].target.collectionMethod, "manual_invoice");
  assert.equal(plan.entries[0].target.providerRelationship, null);
});

test("7: a changed source snapshot invalidates an earlier approval", () => {
  const input = standardSnapshot();
  const approved = approval(input, [decision(input, findProposal(input))]);
  input.subscriptions[0].monthlyRateXcd = "30.00";
  assert.throws(
    () => createCanonicalMigrationPlan(input, approved),
    expectPlanningCode("STALE_SOURCE_SNAPSHOT"),
  );
});

test("8: a modified executable plan fails its integrity fingerprint", () => {
  const input = standardSnapshot();
  const plan = createCanonicalMigrationPlan(input, approval(input, [decision(input, findProposal(input))]));
  plan.entries[0].target.name = "Tampered";
  assert.throws(() => assertCanonicalMigrationPlanIntegrity(plan), expectPlanningCode("PLAN_FINGERPRINT_MISMATCH"));
});

test("9: duplicate decisions for one arrangement are rejected", () => {
  const input = standardSnapshot();
  const approvedDecision = decision(input, findProposal(input));
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision, approvedDecision])),
    expectPlanningCode("DUPLICATE_APPROVAL"),
  );
});

test("10: an assignment cannot be approved for two canonical arrangements", () => {
  const input = standardSnapshot();
  input.subscriptions.push(subscription({
    id: "subscription-3",
    planTermMonths: 3,
    stripeSubscriptionId: "sub_verified_3",
  }));
  input.assignments.push(assignment({
    id: "assignment-3",
    deviceId: "device-3",
    intervalMonths: 3,
  }));
  const proposals = analyzeSubscriptionMigration(input).customers[0].proposals;
  const first = decision(input, proposals[0]);
  const second = decision(input, proposals[1]);
  second.items[0].assignmentIds = [...first.items[0].assignmentIds];
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [first, second])),
    expectPlanningCode("DUPLICATE_ASSIGNMENT_MEMBERSHIP"),
  );
});

test("11: an assignment from another customer cannot be approved", () => {
  const input = standardSnapshot();
  input.customers.push({ id: "customer-2", billingMode: "manual_legacy", archivedAt: null });
  input.assignments.push(assignment({ id: "foreign-assignment", customerId: "customer-2" }));
  const approvedDecision = decision(input, findProposal(input));
  approvedDecision.items[0].assignmentIds = ["foreign-assignment"];
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("ASSIGNMENT_OWNERSHIP_MISMATCH"),
  );
});

test("12: an assignment already linked to a canonical item cannot be planned again", () => {
  const input = standardSnapshot();
  input.assignments[0].subscriptionItemId = "canonical-item-1";
  const proposal = findProposal(input);
  const approvedDecision = decision(input, proposal);
  approvedDecision.items[0].assignmentIds = ["assignment-1"];
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("ASSIGNMENT_ALREADY_CANONICAL"),
  );
});

test("13: item totals must equal the explicitly approved cycle total", () => {
  const input = standardSnapshot();
  const approvedDecision = decision(input, findProposal(input), { expectedTotalAmountPerCycle: "30.00" });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("ITEM_TOTAL_MISMATCH"),
  );
});

test("14: invalid commercial date ordering is rejected", () => {
  const input = standardSnapshot();
  const approvedDecision = decision(input, findProposal(input), {
    commercialStartDate: "2026-11-01",
    billingAnchorDate: "2026-10-01",
  });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("INVALID_BILLING_DATES"),
  );
});

test("15: Stripe collection requires a verified provider relationship", () => {
  const input = standardSnapshot();
  const approvedDecision = decision(input, findProposal(input), { providerRelationship: null });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("PROVIDER_RELATIONSHIP_REQUIRED"),
  );
});

test("16: provider reference changes require a documented override", () => {
  const input = standardSnapshot();
  const approvedDecision = decision(input, findProposal(input));
  assert.ok(approvedDecision.providerRelationship);
  approvedDecision.providerRelationship.externalSubscriptionId = "sub_different";
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("PROVIDER_REFERENCE_MISMATCH"),
  );
});

test("17: one provider subscription cannot be assigned to two canonical arrangements", () => {
  const input = standardSnapshot();
  input.subscriptions.push(subscription({
    id: "subscription-3",
    planTermMonths: 3,
    stripeSubscriptionId: "sub_verified_3",
  }));
  input.assignments.push(assignment({ id: "assignment-3", deviceId: "device-3", intervalMonths: 3 }));
  const proposals = analyzeSubscriptionMigration(input).customers[0].proposals;
  const decisions = proposals.map((proposal) => decision(input, proposal));
  assert.ok(decisions[0].providerRelationship && decisions[1].providerRelationship);
  decisions[1].providerRelationship.externalSubscriptionId = decisions[0].providerRelationship.externalSubscriptionId;
  decisions[1].issueResolutions.push({
    code: "provider_relationship_override",
    explanation: "The owner explicitly supplied a corrected provider reference.",
  });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, decisions)),
    expectPlanningCode("DUPLICATE_PROVIDER_RELATIONSHIP"),
  );
});

test("18: a manual arrangement cannot silently receive a provider relationship", () => {
  const input = snapshot();
  input.customers[0].billingMode = "manual_legacy";
  input.recurringSchedules.push(schedule());
  input.assignments.push(assignment());
  const proposal = findProposal(input);
  const approvedDecision = decision(input, proposal, {
    providerRelationship: {
      provider: "stripe",
      externalSubscriptionId: "sub_not_manual",
      providerStatus: "active",
      activatedAt: PERIOD_START,
      providerItems: [],
    },
  });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approvedDecision])),
    expectPlanningCode("UNEXPECTED_PROVIDER_RELATIONSHIP"),
  );
});

test("19: two same-frequency arrangements require and preserve explicit membership decisions", () => {
  const input = standardSnapshot();
  input.subscriptions.push(subscription({
    id: "subscription-2",
    stripeSubscriptionId: "sub_verified_2",
  }));
  input.assignments.push(assignment({ id: "assignment-2", deviceId: "device-2" }));
  const proposals = analyzeSubscriptionMigration(input).customers[0].proposals;
  assert.ok(proposals.every((proposal) => proposal.reviewStatus === "conflict"));
  const decisions = proposals.map((proposal, index) => {
    const approved = decision(input, proposal);
    approved.items[0].assignmentIds = [`assignment-${index + 1}`];
    return approved;
  });
  const plan = createCanonicalMigrationPlan(input, approval(input, decisions));
  assert.equal(plan.entries.length, 2);
  assert.deepEqual(
    plan.entries.flatMap((entry) => entry.target.items.flatMap((item) => item.assignmentIds)).sort(),
    ["assignment-1", "assignment-2"],
  );
});

test("20: a negotiated monthly rate remains explicitly classified and exact", () => {
  const input = standardSnapshot();
  input.subscriptions[0].monthlyRateXcd = "20.00";
  const proposal = findProposal(input);
  assert.equal(proposal.pricingAssessment, "negotiated");
  const plan = createCanonicalMigrationPlan(input, approval(input, [decision(input, proposal)]));
  assert.equal(plan.entries[0].target.items[0].classification, "negotiated");
  assert.equal(plan.entries[0].target.items[0].agreedAmountPerCycle, "20.00");
});

test("21: unresolved pricing cannot proceed without an explicit reviewed amount and resolution", () => {
  const input = standardSnapshot();
  input.subscriptions[0].monthlyRateXcd = null;
  input.subscriptions[0].agreedAmountPerCycle = null;
  const proposal = findProposal(input);
  assert.equal(proposal.proposedCycleAmount, null);
  const approved = decision(input, proposal, { issueResolutions: [] });
  assert.throws(
    () => createCanonicalMigrationPlan(input, approval(input, [approved])),
    expectPlanningCode("UNRESOLVED_REVIEW_ISSUE"),
  );
});

test("22: local execution guard requires the exact opt-in and confirmation token", () => {
  assert.throws(() => assertLocalMigrationExecutionGuard({
    execute: false,
    confirmation: "wrong",
    expectedConfirmation: APPLY_MIGRATION_CONFIRMATION,
    environment: {},
  }), (error: unknown) => error instanceof CanonicalMigrationExecutionError
    && error.code === "EXPLICIT_EXECUTION_REQUIRED");
});

test("23: local execution guard rejects production, Vercel, remote, and unsafe database names", () => {
  const base = {
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    expectedConfirmation: APPLY_MIGRATION_CONFIRMATION,
  };
  for (const environment of [
    { ALLOW_CANONICAL_MIGRATION_EXECUTION: "true", NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@localhost/tlportal_test" },
    { ALLOW_CANONICAL_MIGRATION_EXECUTION: "true", VERCEL: "1", DATABASE_URL: "postgresql://u:p@localhost/tlportal_test" },
    { ALLOW_CANONICAL_MIGRATION_EXECUTION: "true", DATABASE_URL: "postgresql://u:p@example.com/tlportal_test" },
    { ALLOW_CANONICAL_MIGRATION_EXECUTION: "true", DATABASE_URL: "postgresql://u:p@localhost/tlportal" },
  ]) {
    assert.throws(() => assertLocalMigrationExecutionGuard({ ...base, environment }));
  }
});

test("24: local execution guard accepts an explicitly enabled localhost test database", () => {
  assert.doesNotThrow(() => assertLocalMigrationExecutionGuard({
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    expectedConfirmation: APPLY_MIGRATION_CONFIRMATION,
    environment: {
      ALLOW_CANONICAL_MIGRATION_EXECUTION: "true",
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/tlportal_test?schema=public",
    },
  }));
});
