import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analyzeSubscriptionMigration,
  subscriptionMigrationAnalysisCsv,
  subscriptionMigrationAnalysisMarkdown,
  type LegacyAssignment,
  type LegacyBillingSnapshot,
  type LegacyRecurringSchedule,
  type LegacySubscription,
} from "../lib/domain/subscription-migration-analysis";

const DATE = "2026-10-15T00:00:00.000Z";

function snapshot(): LegacyBillingSnapshot {
  return {
    schemaVersion: "phase-2a-source-v1",
    analysisDate: "2026-10-15",
    customers: [{ id: "customer-1", billingMode: "stripe_subscription", archivedAt: null }],
    subscriptions: [],
    billingAccounts: [],
    catalogPrices: [1, 3, 6, 12].map((durationMonths) => ({
      id: `catalog-${durationMonths}`,
      monthlyRateXcd: "25.00",
      durationMonths,
      isActive: true,
    })),
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
    stripeSubscriptionId: "sub_external_1",
    stripeCustomerId: "cus_external_1",
    currentPeriodStart: DATE,
    currentPeriodEnd: "2026-11-15T00:00:00.000Z",
    cancelAt: null,
    agreedAmountPerCycle: null,
    currency: null,
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
    simCardId: "sim-1",
    status: "active",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: null,
    intervalMonths: 1,
    nextDueDate: "2026-11-15T00:00:00.000Z",
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
    serviceAssignmentId: null,
    status: "active",
    intervalMonths: 1,
    currency: "XCD",
    nextIssueDate: "2026-11-15T12:00:00.000Z",
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

function issueCodes(value: { issues: Array<{ code: string }> }): string[] {
  return value.issues.map((entry) => entry.code);
}

test("1: monthly Stripe billing produces an exact review proposal", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(assignment());
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.reviewStatus, "ready_for_review");
  assert.equal(proposal.proposedCycleAmount, "25.00");
  assert.equal(proposal.normalizedMonthlyAmount, "25.00");
  assert.equal(proposal.proposedItems.length, 1);
});

test("2: quarterly price inference requires confirmation", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ planTermMonths: 3 }));
  input.assignments.push(assignment({ intervalMonths: 3 }));
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.proposedCycleAmount, "75.00");
  assert.equal(proposal.reviewStatus, "needs_confirmation");
  assert.ok(issueCodes(proposal).includes("multi_month_price_inferred"));
});

test("3: annual legacy discounts are not reconstructed", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ planTermMonths: 12 }));
  input.assignments.push(assignment({ intervalMonths: 12 }));
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.proposedCycleAmount, null);
  assert.ok(issueCodes(proposal).includes("annual_price_requires_verification"));
});

test("4: explicit annual cycle pricing is preserved exactly", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({
    planTermMonths: 12,
    agreedAmountPerCycle: "275.00",
  }));
  input.assignments.push(assignment({ intervalMonths: 12 }));
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.proposedCycleAmount, "275.00");
  assert.equal(proposal.normalizedMonthlyAmount, "22.92");
});

test("5: manual schedule preserves its snapshotted line total", () => {
  const input = snapshot();
  input.customers[0].billingMode = "manual_legacy";
  input.recurringSchedules.push(schedule());
  input.assignments.push(assignment());
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.collectionMethod, "manual_invoice");
  assert.equal(proposal.proposedCycleAmount, "25.00");
  assert.equal(proposal.reviewStatus, "ready_for_review");
});

test("6: multiple arrangements at different cadences map independently", () => {
  const input = snapshot();
  input.subscriptions.push(
    subscription(),
    subscription({ id: "subscription-3m", planTermMonths: 3, stripeSubscriptionId: "sub_3m" }),
  );
  input.assignments.push(
    assignment(),
    assignment({ id: "assignment-3m", deviceId: "device-3m", intervalMonths: 3 }),
  );
  const proposals = analyzeSubscriptionMigration(input).customers[0].proposals;
  assert.deepEqual(proposals.map((entry) => entry.proposedItems.length), [1, 1]);
});

test("7: same-cadence arrangements never claim assignments by latest-row guess", () => {
  const input = snapshot();
  input.subscriptions.push(
    subscription(),
    subscription({ id: "subscription-2", stripeSubscriptionId: "sub_external_2" }),
  );
  input.assignments.push(assignment());
  const proposals = analyzeSubscriptionMigration(input).customers[0].proposals;
  assert.ok(proposals.every((entry) => entry.reviewStatus === "conflict"));
  assert.ok(proposals.every((entry) => entry.proposedItems.length === 0));
});

test("8: simultaneous manual and automatic billing is a conflict", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.recurringSchedules.push(schedule());
  input.assignments.push(assignment());
  const review = analyzeSubscriptionMigration(input).customers[0];
  assert.equal(review.reviewStatus, "conflict");
  assert.ok(issueCodes(review).includes("manual_automatic_overlap"));
});

test("9: active services without any billing arrangement are exposed", () => {
  const input = snapshot();
  input.assignments.push(assignment());
  const review = analyzeSubscriptionMigration(input).customers[0];
  assert.equal(review.reviewStatus, "conflict");
  assert.ok(issueCodes(review).includes("services_without_billing_arrangement"));
});

test("10: canceled assignment with no end date remains historical", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(assignment({ status: "cancelled", endDate: null }));
  const review = analyzeSubscriptionMigration(input).customers[0];
  assert.deepEqual(review.historicalAssignmentIds, ["assignment-1"]);
  assert.ok(issueCodes(review).includes("canceled_assignment_without_end_date"));
});

test("11: hardware replacement history does not create a second item", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(
    assignment({ id: "assignment-old", deviceId: "device-old", endDate: DATE, status: "cancelled" }),
    assignment({ id: "assignment-new", deviceId: "device-new" }),
  );
  const analysis = analyzeSubscriptionMigration(input);
  assert.deepEqual(analysis.customers[0].historicalAssignmentIds, ["assignment-old"]);
  assert.equal(analysis.customers[0].proposals[0].proposedItems[0].serviceAssignmentId, "assignment-new");
});

test("12: unassigned device and SIM inventory is counted but never made billable", () => {
  const input = snapshot();
  input.inventory = { deviceIds: ["device-free"], simCardIds: ["sim-free"] };
  const metrics = analyzeSubscriptionMigration(input).metrics;
  assert.equal(metrics.unassignedInventoryDevices, 1);
  assert.equal(metrics.unassignedInventorySimCards, 1);
  assert.equal(metrics.proposedItems, 0);
});

test("13: mirrored provider amount differences are visible", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(assignment());
  input.billingInvoices.push({
    id: "billing-invoice-1",
    customerId: "customer-1",
    customerSubscriptionId: "subscription-1",
    subscriptionProviderLinkId: null,
    provider: "stripe",
    externalInvoiceId: "in_external_1",
    status: "paid",
    kind: "subscription",
    amountXcd: "27.50",
    currency: "xcd",
    stripeSubscriptionId: "sub_external_1",
    periodStart: DATE,
    periodEnd: "2026-11-15T00:00:00.000Z",
    createdAt: DATE,
  });
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.ok(issueCodes(proposal).includes("provider_amount_differs"));
});

test("14: outstanding native balances retain partial-payment state", () => {
  const input = snapshot();
  input.invoices.push({
    id: "invoice-1",
    customerId: "customer-1",
    customerSubscriptionId: null,
    recurringScheduleId: null,
    billingInvoiceId: null,
    status: "partially_paid",
    kind: "one_off",
    currency: "XCD",
    total: "100.00",
    amountPaid: "40.00",
    amountDue: "60.00",
    issueDate: DATE,
    archivedAt: null,
    recurringGenerationKey: null,
    invoilessInvoiceId: null,
  });
  input.payments.push({
    id: "payment-1",
    invoiceId: "invoice-1",
    customerId: "customer-1",
    amount: "40.00",
    currency: "XCD",
    method: "cheque",
    reference: "redacted",
    stripePaymentIntentId: null,
    voidedAt: null,
  });
  const review = analyzeSubscriptionMigration(input).customers[0];
  assert.equal(review.outstandingNativeBalance, "60.00");
  assert.deepEqual(review.paymentIds, ["payment-1"]);
});

test("15: duplicate recurring invoice generation keys are reported globally", () => {
  const input = snapshot();
  const base = {
    customerId: "customer-1",
    customerSubscriptionId: null,
    recurringScheduleId: "schedule-1",
    billingInvoiceId: null,
    status: "open",
    kind: "recurring",
    currency: "XCD",
    total: "25.00",
    amountPaid: "0.00",
    amountDue: "25.00",
    issueDate: DATE,
    archivedAt: null,
    recurringGenerationKey: "schedule-1:2026-10-15",
    invoilessInvoiceId: null,
  };
  input.invoices.push({ id: "invoice-1", ...base }, { id: "invoice-2", ...base });
  assert.ok(analyzeSubscriptionMigration(input).globalIssues.some((entry) =>
    entry.code === "duplicate_recurring_generation"));
});

test("16: duplicate Stripe payment identifiers are reported without exposing the identifier", () => {
  const input = snapshot();
  input.payments.push(
    { id: "payment-1", invoiceId: "invoice-1", customerId: "customer-1", amount: "1.00", currency: "XCD", method: "stripe", reference: null, stripePaymentIntentId: "pi_secretish", voidedAt: null },
    { id: "payment-2", invoiceId: "invoice-2", customerId: "customer-1", amount: "1.00", currency: "XCD", method: "stripe", reference: null, stripePaymentIntentId: "pi_secretish", voidedAt: null },
  );
  const analysis = analyzeSubscriptionMigration(input);
  assert.ok(analysis.globalIssues.some((entry) => entry.code === "duplicate_stripe_payment"));
  assert.doesNotMatch(JSON.stringify(analysis), /pi_secretish/);
});

test("17: unsupported terms are conflicts", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ planTermMonths: 2 }));
  input.assignments.push(assignment({ intervalMonths: 2 }));
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.reviewStatus, "conflict");
  assert.ok(issueCodes(proposal).includes("unsupported_interval"));
});

test("18: a missing Stripe subscription identifier requires confirmation", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ stripeSubscriptionId: null }));
  input.assignments.push(assignment());
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.ok(issueCodes(proposal).includes("stripe_subscription_id_missing"));
  assert.equal(proposal.reviewStatus, "needs_confirmation");
});

test("19: a direct schedule assignment does not absorb another matching service", () => {
  const input = snapshot();
  input.customers[0].billingMode = "manual_legacy";
  input.recurringSchedules.push(schedule({ serviceAssignmentId: "assignment-1" }));
  input.assignments.push(
    assignment(),
    assignment({ id: "assignment-2", deviceId: "device-2", simCardId: "sim-2" }),
  );
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.deepEqual(proposal.proposedItems.map((entry) => entry.serviceAssignmentId), ["assignment-1"]);
  assert.deepEqual(proposal.unmappedAssignmentIds, ["assignment-2"]);
});

test("20: output is deterministic and supports JSON-adjacent CSV and human review", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(assignment());
  const first = analyzeSubscriptionMigration(input);
  const reordered = { ...input, subscriptions: [...input.subscriptions].reverse(), assignments: [...input.assignments].reverse() };
  const second = analyzeSubscriptionMigration(reordered);
  assert.deepEqual(second, first);
  assert.match(subscriptionMigrationAnalysisCsv(first), /proposal_id/);
  assert.match(subscriptionMigrationAnalysisMarkdown(first), /Aggregate reconciliation/);
});

test("canonical or shadow rows are not re-proposed as legacy migration work", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ controlMode: "shadow" }));
  assert.equal(analyzeSubscriptionMigration(input).metrics.proposals, 0);
});

test("conflicting assignment renewal dates block a shared billing anchor", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ vehicleCount: 2 }));
  input.assignments.push(
    assignment(),
    assignment({
      id: "assignment-2",
      deviceId: "device-2",
      simCardId: "sim-2",
      nextDueDate: "2026-12-15T00:00:00.000Z",
    }),
  );
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.reviewStatus, "conflict");
  assert.ok(issueCodes(proposal).includes("conflicting_assignment_renewals"));
});

test("Stripe customer references reconcile through BillingAccount", () => {
  const input = snapshot();
  input.subscriptions.push(subscription());
  input.assignments.push(assignment());
  input.billingAccounts.push({
    id: "billing-account-1",
    customerId: "customer-1",
    provider: "stripe",
    externalCustomerId: "different_customer",
    status: "active",
  });
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.billingAccountId, "billing-account-1");
  assert.equal(proposal.reviewStatus, "conflict");
  assert.ok(issueCodes(proposal).includes("stripe_customer_reference_mismatch"));
});

test("the database snapshot loader is structurally read-only", async () => {
  const source = await readFile(
    new URL("../lib/services/subscription-migration-analysis-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /findMany/);
  assert.doesNotMatch(source, /\.(create|update|upsert|delete|executeRaw|queryRaw)\s*\(/);
  assert.doesNotMatch(source, /stripe\./i);
});

test("heterogeneous manual rates preserve the total without inventing item prices", () => {
  const input = snapshot();
  input.customers[0].billingMode = "manual_legacy";
  input.recurringSchedules.push(schedule({
    lineItems: [
      { id: "line-1", description: "Standard", quantity: "1", unitPrice: "25.00", lineTotal: "25.00" },
      { id: "line-2", description: "Negotiated", quantity: "1", unitPrice: "20.00", lineTotal: "20.00" },
    ],
  }));
  input.assignments.push(
    assignment(),
    assignment({ id: "assignment-2", deviceId: "device-2", simCardId: "sim-2" }),
  );
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.proposedCycleAmount, "45.00");
  assert.ok(proposal.proposedItems.every((entry) => entry.proposedCycleAmount == null));
  assert.ok(issueCodes(proposal).includes("heterogeneous_schedule_rates"));
});

test("a canceled source with active service assignments is a conflict", () => {
  const input = snapshot();
  input.subscriptions.push(subscription({ status: "canceled" }));
  input.assignments.push(assignment());
  const proposal = analyzeSubscriptionMigration(input).customers[0].proposals[0];
  assert.equal(proposal.reviewStatus, "conflict");
  assert.ok(issueCodes(proposal).includes("closed_arrangement_has_active_assignments"));
});

test("a manual schedule linked to a legacy subscription is one arrangement, not two", () => {
  const input = snapshot();
  input.customers[0].billingMode = "manual_legacy";
  input.subscriptions.push(subscription({ stripeSubscriptionId: null }));
  input.recurringSchedules.push(schedule({ customerSubscriptionId: "subscription-1" }));
  input.assignments.push(assignment());
  const analysis = analyzeSubscriptionMigration(input);
  assert.equal(analysis.metrics.proposals, 1);
  assert.equal(analysis.customers[0].proposals[0].sourceKind, "manual_schedule");
});

test("CSV output neutralizes spreadsheet formulas and escapes delimiters", () => {
  const input = snapshot();
  input.customers[0].id = '=HYPERLINK("https://invalid.example","customer")';
  input.subscriptions.push(subscription({ customerId: input.customers[0].id }));
  input.assignments.push(assignment({ customerId: input.customers[0].id }));
  const csv = subscriptionMigrationAnalysisCsv(analyzeSubscriptionMigration(input));
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/invalid\.example"",""customer""\)"/);
  assert.doesNotMatch(csv, /(?:^|,)=(?:HYPERLINK|CMD)/m);
});

test("representative dry-run fixture reconciles source arrangements and totals", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/phase-2a-representative-snapshot.json", import.meta.url),
    "utf8",
  )) as LegacyBillingSnapshot;
  const analysis = analyzeSubscriptionMigration(fixture);
  assert.equal(fixture.subscriptions.length + fixture.recurringSchedules.length, 11);
  assert.equal(analysis.metrics.proposals, 11);
  assert.equal(analysis.metrics.proposedItems, 8);
  assert.equal(analysis.metrics.mappedAssignments, 8);
  assert.equal(analysis.metrics.unmappedAssignments, 3);
  assert.equal(analysis.metrics.proposedCycleAmountKnown, "465.00");
  assert.equal(analysis.metrics.conflictedCycleAmountKnown, "100.00");
  assert.equal(analysis.metrics.provisionalNormalizedMonthlyRevenue, "172.92");
  assert.equal(analysis.metrics.conflictedNormalizedMonthlyRevenue, "100.00");
  assert.equal(analysis.metrics.unresolvedAmountProposals, 1);
  assert.equal(analysis.metrics.outstandingNativeBalance, "25.00");
  const proposals = analysis.customers.flatMap((customer) => customer.proposals);
  const missingAnnual = proposals.find((proposal) =>
    proposal.proposalId === "subscription:subscription-annual-missing");
  assert.equal(missingAnnual?.proposedCycleAmount, null);
  assert.equal(missingAnnual?.reviewStatus, "needs_confirmation");
});
