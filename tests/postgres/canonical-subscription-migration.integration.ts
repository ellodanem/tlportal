import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../lib/db";
import {
  createCanonicalMigrationPlan,
  MIGRATION_APPROVAL_SCHEMA_VERSION,
  migrationSourceFingerprint,
  type ApprovedArrangementDecision,
} from "../../lib/domain/canonical-subscription-migration";
import { analyzeSubscriptionMigration } from "../../lib/domain/subscription-migration-analysis";
import {
  APPLY_MIGRATION_CONFIRMATION,
  assertLocalMigrationExecutionGuard,
  CanonicalMigrationExecutionError,
  executeCanonicalMigrationPlan,
  REVERSE_MIGRATION_CONFIRMATION,
  reverseCanonicalMigration,
} from "../../lib/services/canonical-subscription-migration-service";
import { getCurrentCustomerSubscription } from "../../lib/services/customer-subscription-service";
import { loadLegacyBillingSnapshot } from "../../lib/services/subscription-migration-analysis-service";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const EXECUTION_ENVIRONMENT = {
  ALLOW_CANONICAL_MIGRATION_EXECUTION: process.env.ALLOW_CANONICAL_MIGRATION_EXECUTION,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL,
};

assertLocalMigrationExecutionGuard({
  execute: true,
  confirmation: APPLY_MIGRATION_CONFIRMATION,
  expectedConfirmation: APPLY_MIGRATION_CONFIRMATION,
  environment: EXECUTION_ENVIRONMENT,
});

after(async () => {
  await prisma.$disconnect();
});

async function createCustomer(label: string, billingMode: "stripe_subscription" | "manual_legacy" = "stripe_subscription") {
  return prisma.customer.create({
    data: { company: `${label}-${randomUUID()}`, billingMode },
  });
}

async function createAssignment(
  customerId: string,
  intervalMonths: number,
  options: { status?: "active" | "cancelled"; endDate?: Date | null } = {},
) {
  const suffix = randomUUID();
  const model = await prisma.deviceModel.create({
    data: { name: `migration-model-${suffix}`, retailPrice: "100.00" },
  });
  const device = await prisma.device.create({
    data: { imei: suffix.replaceAll("-", "").slice(0, 15), deviceModelId: model.id },
  });
  return prisma.serviceAssignment.create({
    data: {
      customerId,
      deviceId: device.id,
      intervalMonths,
      status: options.status ?? "active",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: options.endDate,
      nextDueDate: new Date("2026-11-01T00:00:00.000Z"),
    },
  });
}

async function createLegacyStripeArrangement(input: {
  customerId: string;
  intervalMonths?: 1 | 3 | 6 | 12;
  monthlyRate?: string;
  vehicleCount?: number;
  agreedAmountPerCycle?: string | null;
}) {
  const intervalMonths = input.intervalMonths ?? 1;
  return prisma.customerSubscription.create({
    data: {
      customerId: input.customerId,
      controlMode: "legacy",
      status: "active",
      planTermMonths: intervalMonths,
      monthlyRateXcd: input.monthlyRate ?? "25.00",
      vehicleCount: input.vehicleCount ?? 1,
      stripeSubscriptionId: `sub_test_${randomUUID()}`,
      stripeCustomerId: `cus_test_${randomUUID()}`,
      currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
      currentPeriodEnd: new Date(intervalMonths === 12
        ? "2027-10-01T00:00:00.000Z"
        : "2026-11-01T00:00:00.000Z"),
      agreedAmountPerCycle: input.agreedAmountPerCycle,
      currency: "XCD",
    },
  });
}

async function createLegacyManualArrangement(customerId: string, assignmentId: string) {
  return prisma.recurringInvoiceSchedule.create({
    data: {
      customerId,
      serviceAssignmentId: assignmentId,
      status: "active",
      name: "Reviewed manual tracking",
      currency: "XCD",
      intervalMonths: 1,
      nextIssueDate: new Date("2026-11-01T12:00:00.000Z"),
      autoEmail: false,
      lineItems: {
        create: {
          description: "Tracking service",
          quantity: "1",
          unitPrice: "25.00",
          lineTotal: "25.00",
        },
      },
    },
  });
}

function exactDecision(
  snapshot: Awaited<ReturnType<typeof loadLegacyBillingSnapshot>>,
  sourceId: string,
  options: {
    assignmentIds?: string[];
    total?: string;
    providerItems?: NonNullable<ApprovedArrangementDecision["providerRelationship"]>["providerItems"];
  } = {},
): ApprovedArrangementDecision {
  const analysis = analyzeSubscriptionMigration(snapshot);
  const customer = analysis.customers.find((review) =>
    review.proposals.some((proposal) => proposal.sourceId === sourceId));
  const proposal = customer?.proposals.find((entry) => entry.sourceId === sourceId);
  assert.ok(customer && proposal, `expected proposal for ${sourceId}`);
  const issueCodes = new Set([...customer.issues, ...proposal.issues]
    .filter((issue) => issue.severity === "decision" || issue.severity === "conflict")
    .map((issue) => issue.code));
  const assignmentIds = options.assignmentIds
    ?? proposal.proposedItems.map((item) => item.serviceAssignmentId);
  assert.ok(assignmentIds.length > 0, "integration approval requires explicit assignment IDs");
  const total = options.total ?? proposal.proposedCycleAmount ?? "275.00";
  const perItem = assignmentIds.length === 1
    ? total
    : (Number(total) / assignmentIds.length).toFixed(2);
  const collectionMethod = proposal.collectionMethod ?? "manual_invoice";
  return {
    proposalId: proposal.proposalId,
    approvedBy: "integration-test-owner",
    approvedAt: "2026-10-15T12:00:00.000Z",
    approvalReason: "Synthetic fixture reviewed for PostgreSQL validation.",
    name: `Canonical ${sourceId}`,
    reference: `canonical-${sourceId}`,
    collectionMethod,
    lifecycleStatus: proposal.lifecycleStatus,
    billingIntervalMonths: proposal.billingIntervalMonths as 1 | 3 | 6 | 12,
    currency: proposal.currency || "XCD",
    commercialStartDate: "2026-01-01",
    billingAnchorDate: "2026-10-01",
    nextBillingDate: proposal.nextBillingDate?.slice(0, 10) ?? "2026-11-01",
    gracePeriodDays: 7,
    defaultItemAmountPerCycle: perItem,
    expectedTotalAmountPerCycle: total,
    items: assignmentIds.map((assignmentId, index) => ({
      itemKey: `item-${index + 1}`,
      label: `Tracking service ${index + 1}`,
      assignmentIds: [assignmentId],
      serviceActivatedDate: "2026-01-01",
      billingEffectiveFrom: "2026-10-01",
      billingEffectiveUntil: null,
      agreedAmountPerCycle: perItem,
      classification: proposal.pricingAssessment === "negotiated" ? "negotiated" : "standard",
      changeReason: "Approved synthetic migration evidence.",
    })),
    providerRelationship: collectionMethod === "stripe_autocharge" ? {
      provider: "stripe",
      externalSubscriptionId: proposal.providerSubscriptionId!,
      providerStatus: "active",
      activatedAt: "2026-10-01T00:00:00.000Z",
      providerItems: options.providerItems ?? [],
    } : null,
    issueResolutions: [...issueCodes].map((code) => ({
      code,
      explanation: `Synthetic owner resolution for ${code}.`,
    })),
  };
}

async function planFor(sourceIds: string[], decisions?: ApprovedArrangementDecision[]) {
  const snapshot = await loadLegacyBillingSnapshot("2026-10-15");
  const approved = decisions ?? sourceIds.map((sourceId) => exactDecision(snapshot, sourceId));
  return createCanonicalMigrationPlan(snapshot, {
    schemaVersion: MIGRATION_APPROVAL_SCHEMA_VERSION,
    sourceFingerprint: migrationSourceFingerprint(snapshot),
    decisions: approved,
  });
}

function execute(plan: ReturnType<typeof createCanonicalMigrationPlan>) {
  return executeCanonicalMigrationPlan(plan, {
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    environment: EXECUTION_ENVIRONMENT,
  });
}

function reverse(migrationKey: string) {
  return reverseCanonicalMigration(migrationKey, {
    execute: true,
    confirmation: REVERSE_MIGRATION_CONFIRMATION,
    environment: EXECUTION_ENVIRONMENT,
  });
}

test("22: standard Stripe migration creates reconciled shadow records without legacy side effects", async () => {
  const customer = await createCustomer("standard");
  const assignmentA = await createAssignment(customer.id, 1);
  const assignmentB = await createAssignment(customer.id, 1);
  const legacy = await createLegacyStripeArrangement({ customerId: customer.id, vehicleCount: 2 });
  const before = {
    invoices: await prisma.invoice.count({ where: { customerId: customer.id } }),
    billingInvoices: await prisma.billingInvoice.count({ where: { customerId: customer.id } }),
    schedules: await prisma.recurringInvoiceSchedule.count({ where: { customerId: customer.id } }),
  };
  const snapshot = await loadLegacyBillingSnapshot("2026-10-15");
  const approved = exactDecision(snapshot, legacy.id, {
    assignmentIds: [assignmentA.id, assignmentB.id],
    total: "50.00",
    providerItems: [{
      externalSubscriptionItemId: `si_test_${randomUUID()}`,
      externalPriceId: `price_test_${randomUUID()}`,
      agreedAmountPerCycle: "50.00",
      quantity: 2,
      rateGroupFingerprint: `rate-${randomUUID()}`,
    }],
  });
  const plan = await planFor([legacy.id], [approved]);
  const result = await execute(plan);
  const targetId = result.entries[0].targetSubscriptionId;
  assert.ok(targetId && result.entries[0].reconciliation?.matched);
  const target = await prisma.customerSubscription.findUniqueOrThrow({
    where: { id: targetId },
    include: { items: { include: { rates: true, serviceAssignments: true } }, providerLinks: { include: { providerItems: true } } },
  });
  assert.equal(target.controlMode, "shadow");
  assert.equal(target.stripeSubscriptionId, null);
  assert.equal(target.items.length, 2);
  assert.equal(target.providerLinks[0].externalSubscriptionId, legacy.stripeSubscriptionId);
  assert.equal(target.providerLinks[0].providerItems.length, 1);
  assert.deepEqual(before, {
    invoices: await prisma.invoice.count({ where: { customerId: customer.id } }),
    billingInvoices: await prisma.billingInvoice.count({ where: { customerId: customer.id } }),
    schedules: await prisma.recurringInvoiceSchedule.count({ where: { customerId: customer.id } }),
  });
});

test("23: repeat and concurrent execution create exactly one canonical target", async () => {
  const customer = await createCustomer("concurrent");
  await createAssignment(customer.id, 1);
  const legacy = await createLegacyStripeArrangement({ customerId: customer.id });
  const plan = await planFor([legacy.id]);
  const [first, second] = await Promise.all([execute(plan), execute(plan)]);
  const targetIds = [first.entries[0].targetSubscriptionId, second.entries[0].targetSubscriptionId];
  assert.equal(new Set(targetIds).size, 1);
  assert.equal(await prisma.canonicalMigrationLedger.count({
    where: { migrationKey: plan.entries[0].migrationKey },
  }), 1);
  assert.equal(await prisma.customerSubscription.count({
    where: { customerId: customer.id, controlMode: "shadow" },
  }), 1);
  const repeated = await execute(plan);
  assert.equal(repeated.entries[0].alreadyApplied, true);
});

test("24: multiple, manual, negotiated, quarterly, six-month, and annual arrangements stay separate", async () => {
  const stripeCustomer = await createCustomer("multiple-terms");
  await createAssignment(stripeCustomer.id, 3);
  await createAssignment(stripeCustomer.id, 6);
  await createAssignment(stripeCustomer.id, 12);
  const quarterly = await createLegacyStripeArrangement({ customerId: stripeCustomer.id, intervalMonths: 3, monthlyRate: "20.00" });
  const sixMonth = await createLegacyStripeArrangement({ customerId: stripeCustomer.id, intervalMonths: 6, monthlyRate: "22.00" });
  const annual = await createLegacyStripeArrangement({ customerId: stripeCustomer.id, intervalMonths: 12, agreedAmountPerCycle: "275.00" });
  const manualCustomer = await createCustomer("manual", "manual_legacy");
  const manualAssignment = await createAssignment(manualCustomer.id, 1);
  const manual = await createLegacyManualArrangement(manualCustomer.id, manualAssignment.id);
  const plan = await planFor([quarterly.id, sixMonth.id, annual.id, manual.id]);
  const result = await execute(plan);
  assert.equal(result.entries.length, 4);
  const targets = await prisma.customerSubscription.findMany({
    where: { id: { in: result.entries.flatMap((entry) => entry.targetSubscriptionId ? [entry.targetSubscriptionId] : []) } },
    orderBy: { billingIntervalMonths: "asc" },
  });
  assert.deepEqual(targets.map((entry) => entry.billingIntervalMonths), [1, 3, 6, 12]);
  assert.ok(targets.every((entry) => entry.controlMode === "shadow"));
  assert.equal(targets.find((entry) => entry.billingIntervalMonths === 12)?.agreedAmountPerCycle?.toFixed(2), "275.00");
});

test("25: historical hardware replacement assignments can share one approved commercial item", async () => {
  const customer = await createCustomer("hardware-history");
  const oldAssignment = await createAssignment(customer.id, 1, {
    status: "cancelled",
    endDate: new Date("2026-06-01T00:00:00.000Z"),
  });
  const currentAssignment = await createAssignment(customer.id, 1);
  const legacy = await createLegacyStripeArrangement({ customerId: customer.id });
  const source = await loadLegacyBillingSnapshot("2026-10-15");
  const approved = exactDecision(source, legacy.id, { assignmentIds: [currentAssignment.id] });
  approved.items[0].assignmentIds = [oldAssignment.id, currentAssignment.id];
  const plan = await planFor([legacy.id], [approved]);
  const result = await execute(plan);
  const item = await prisma.subscriptionItem.findFirstOrThrow({
    where: { customerSubscriptionId: result.entries[0].targetSubscriptionId! },
    include: { serviceAssignments: true },
  });
  assert.deepEqual(item.serviceAssignments.map((entry) => entry.id).sort(), [oldAssignment.id, currentAssignment.id].sort());
});

test("26: an in-transaction provider conflict rolls back all canonical target records", async () => {
  const blockerCustomer = await createCustomer("provider-blocker");
  const blockerSubscription = await prisma.customerSubscription.create({
    data: {
      customerId: blockerCustomer.id,
      name: "Existing shadow",
      collectionMethod: "stripe_autocharge",
      lifecycleStatus: "draft",
      billingIntervalMonths: 1,
      currency: "XCD",
      agreedAmountPerCycle: "25.00",
      commercialStartDate: new Date("2026-01-01T00:00:00.000Z"),
      billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
      nextBillingDate: new Date("2026-11-01T00:00:00.000Z"),
      controlMode: "shadow",
      planTermMonths: 1,
    },
  });
  const blockerLink = await prisma.subscriptionProviderLink.create({
    data: {
      customerSubscriptionId: blockerSubscription.id,
      provider: "stripe",
      externalSubscriptionId: `sub_blocker_${randomUUID()}`,
    },
  });
  const duplicateProviderItemId = `si_duplicate_${randomUUID()}`;
  await prisma.subscriptionProviderItem.create({
    data: {
      subscriptionProviderLinkId: blockerLink.id,
      externalSubscriptionItemId: duplicateProviderItemId,
      externalPriceId: `price_blocker_${randomUUID()}`,
      currency: "XCD",
      billingIntervalMonths: 1,
      agreedAmountPerCycle: "25.00",
      quantity: 1,
      rateGroupFingerprint: `blocker-${randomUUID()}`,
    },
  });

  const customer = await createCustomer("rollback");
  const assignment = await createAssignment(customer.id, 1);
  const legacy = await createLegacyStripeArrangement({ customerId: customer.id });
  const source = await loadLegacyBillingSnapshot("2026-10-15");
  const approved = exactDecision(source, legacy.id, {
    assignmentIds: [assignment.id],
    providerItems: [{
      externalSubscriptionItemId: duplicateProviderItemId,
      externalPriceId: `price_conflict_${randomUUID()}`,
      agreedAmountPerCycle: "25.00",
      quantity: 1,
      rateGroupFingerprint: `conflict-${randomUUID()}`,
    }],
  });
  const plan = await planFor([legacy.id], [approved]);
  await assert.rejects(() => execute(plan));
  assert.equal(await prisma.customerSubscription.count({
    where: { customerId: customer.id, controlMode: "shadow" },
  }), 0);
  assert.equal((await prisma.serviceAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).subscriptionItemId, null);
  const ledger = await prisma.canonicalMigrationLedger.findUniqueOrThrow({
    where: { migrationKey: plan.entries[0].migrationKey },
  });
  assert.equal(ledger.status, "failed_rolled_back");
  assert.equal(ledger.targetSubscriptionId, null);
});

test("27: unused shadow migration reverses cleanly, but financial history blocks deletion", async () => {
  const reversibleCustomer = await createCustomer("reversible");
  const reversibleAssignment = await createAssignment(reversibleCustomer.id, 1);
  const reversibleLegacy = await createLegacyStripeArrangement({ customerId: reversibleCustomer.id });
  const reversiblePlan = await planFor([reversibleLegacy.id]);
  const applied = await execute(reversiblePlan);
  const targetId = applied.entries[0].targetSubscriptionId!;
  const reversed = await reverse(reversiblePlan.entries[0].migrationKey);
  assert.equal(reversed.reversedSubscriptionId, targetId);
  assert.equal(await prisma.customerSubscription.count({ where: { id: targetId } }), 0);
  assert.equal((await prisma.serviceAssignment.findUniqueOrThrow({ where: { id: reversibleAssignment.id } })).subscriptionItemId, null);

  const protectedCustomer = await createCustomer("protected");
  await createAssignment(protectedCustomer.id, 1);
  const protectedLegacy = await createLegacyStripeArrangement({ customerId: protectedCustomer.id });
  const protectedPlan = await planFor([protectedLegacy.id]);
  const protectedApplied = await execute(protectedPlan);
  const protectedTargetId = protectedApplied.entries[0].targetSubscriptionId!;
  await prisma.invoice.create({
    data: {
      customerId: protectedCustomer.id,
      customerSubscriptionId: protectedTargetId,
      status: "draft",
      total: "25.00",
      amountDue: "25.00",
    },
  });
  await assert.rejects(
    () => reverse(protectedPlan.entries[0].migrationKey),
    (error: unknown) => error instanceof CanonicalMigrationExecutionError
      && error.code === "REVERSAL_REQUIRES_MANUAL_REVIEW",
  );
  assert.equal(await prisma.customerSubscription.count({ where: { id: protectedTargetId } }), 1);
  assert.equal((await prisma.canonicalMigrationLedger.findUniqueOrThrow({
    where: { migrationKey: protectedPlan.entries[0].migrationKey },
  })).status, "needs_review");
});

test("28: newer shadow rows never replace legacy authority in current billing lookup", async () => {
  const customer = await createCustomer("legacy-authority");
  const legacy = await createLegacyStripeArrangement({ customerId: customer.id });
  await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      name: "Newer shadow",
      collectionMethod: "manual_invoice",
      lifecycleStatus: "active",
      billingIntervalMonths: 1,
      currency: "XCD",
      agreedAmountPerCycle: "999.00",
      commercialStartDate: new Date("2026-10-01T00:00:00.000Z"),
      billingAnchorDate: new Date("2026-10-01T00:00:00.000Z"),
      nextBillingDate: new Date("2026-11-01T00:00:00.000Z"),
      controlMode: "shadow",
      status: "active",
      planTermMonths: 1,
    },
  });
  const current = await getCurrentCustomerSubscription(customer.id);
  assert.equal(current?.id, legacy.id);
  assert.equal(current?.controlMode, "legacy");
});
