import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../lib/db";
import {
  classifyStandaloneInvoiceForMigration,
  createOwnerApprovedIndividualMigrationCampaign,
  executeSimpleIndividualMigration,
  executeOwnerApprovedMigrationCampaign,
  getCanonicalMigrationCampaignDashboard,
  getCanonicalMigrationCampaignDetail,
  getCanonicalMigrationProposalReview,
} from "../../lib/services/canonical-migration-campaign-service";

after(async () => {
  await prisma.$disconnect();
});

async function fixture(label: string) {
  const suffix = randomUUID();
  const owner = await prisma.user.create({
    data: { email: `campaign-owner-${suffix}@example.test`, passwordHash: "not-used", name: "Campaign owner" },
  });
  const customer = await prisma.customer.create({ data: { company: `${label}-${suffix}`, billingMode: "manual_legacy" } });
  const model = await prisma.deviceModel.create({ data: { name: `campaign-model-${suffix}`, retailPrice: "100.00" } });
  const device = await prisma.device.create({ data: { imei: suffix.replaceAll("-", "").slice(0, 15), deviceModelId: model.id } });
  const assignment = await prisma.serviceAssignment.create({
    data: {
      customerId: customer.id,
      deviceId: device.id,
      status: "active",
      intervalMonths: 1,
      startDate: new Date("2026-01-15T00:00:00.000Z"),
      nextDueDate: new Date("2026-11-15T00:00:00.000Z"),
    },
  });
  const schedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      serviceAssignmentId: assignment.id,
      status: "active",
      name: `${label} manual schedule`,
      currency: "XCD",
      intervalMonths: 1,
      nextIssueDate: new Date("2026-11-15T00:00:00.000Z"),
      autoEmail: false,
      lineItems: { create: { description: "GPS tracking", quantity: "1", unitPrice: "30.00", lineTotal: "30.00" } },
    },
  });
  return { owner, customer, assignment, schedule };
}

async function approveIndividual(input: Awaited<ReturnType<typeof fixture>>) {
  const review = await getCanonicalMigrationProposalReview(`schedule:${input.schedule.id}`);
  assert.ok(review, "manual schedule should appear in the migration review");
  return createOwnerApprovedIndividualMigrationCampaign({
    proposalId: review.proposal.proposalId,
    title: `Campaign ${input.customer.id}`,
    approvalReason: "Synthetic owner review confirms rates, covered period, renewal, and retained legacy authority.",
    ownerUserId: input.owner.id,
    ownerEmail: input.owner.email,
    commercialStartDate: "2026-10-15",
    billingAnchorDate: "2026-10-15",
    nextBillingDate: "2026-11-15",
    gracePeriodDays: 7,
    items: review.assignments.map((assignment, index) => ({
      assignmentId: assignment.serviceAssignmentId,
      label: `GPS tracking service ${index + 1}`,
      serviceActivatedDate: assignment.serviceActivatedDate ?? "2026-01-15",
      agreedAmountPerCycle: "30.00",
      classification: "negotiated" as const,
    })),
    issueResolutions: review.requiredIssues.map((issue) => ({
      code: issue.code,
      explanation: `Synthetic owner resolution for ${issue.code}.`,
    })),
    confirmations: {
      sourceAndServicesReviewed: true,
      paidThroughAndRenewalReviewed: true,
      financialHistoryPreserved: true,
      legacyAuthorityRetained: true,
      outstandingBalanceReviewed: true,
      sourceCoverageReviewed: true,
      stripeProviderReviewed: false,
      futureStripeCollectionReviewed: false,
    },
  });
}

async function simpleMigrationInput(input: Awaited<ReturnType<typeof fixture>>) {
  const review = await getCanonicalMigrationProposalReview(`schedule:${input.schedule.id}`);
  assert.ok(review, "manual schedule should appear in the simple migration review");
  return {
    proposalId: review.proposal.proposalId,
    expectedReviewFingerprint: review.reviewFingerprint,
    ownerUserId: input.owner.id,
    ownerEmail: input.owner.email,
    approvalReason: "Synthetic owner confirms the services, commercial terms, history, and authority transfer.",
    commercialStartDate: "2026-01-15",
    billingAnchorDate: "2026-10-15",
    nextBillingDate: "2026-11-15",
    gracePeriodDays: 7,
    items: review.assignments.map((assignment, index) => ({
      assignmentId: assignment.serviceAssignmentId,
      label: `GPS tracking service ${index + 1}`,
      serviceActivatedDate: assignment.serviceActivatedDate ?? "2026-01-15",
      agreedAmountPerCycle: "30.00",
      classification: "negotiated" as const,
    })),
    sourceInvoiceCoverage: null,
    confirmations: {
      customerAndServicesConfirmed: true,
      commercialTermsConfirmed: true,
      historicalBalancesConfirmed: true,
      billingAuthorityTransferConfirmed: true,
    },
    environment: {
      NODE_ENV: "test",
      CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED: "true",
      CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true",
    },
  };
}

test("campaign review accepts an encoded proposal ID from the individual-review route", async () => {
  const input = await fixture("campaign-encoded-proposal");
  const proposalId = `schedule:${input.schedule.id}`;
  const review = await getCanonicalMigrationProposalReview(encodeURIComponent(proposalId));
  assert.ok(review, "an encoded dynamic route proposal ID should resolve to the source arrangement");
  assert.equal(review.proposal.proposalId, proposalId);
});

test("one-off invoice classification is audited without changing financial history", async () => {
  const input = await fixture("campaign-one-off-classification");
  await prisma.recurringInvoiceSchedule.delete({ where: { id: input.schedule.id } });
  const invoice = await prisma.invoice.create({
    data: {
      customerId: input.customer.id,
      status: "open",
      currency: "XCD",
      subtotal: "125.00",
      taxTotal: "0.00",
      total: "125.00",
      amountPaid: "0.00",
      amountDue: "125.00",
      issueDate: new Date("2026-10-01T00:00:00.000Z"),
      lineItems: { create: { description: "Hardware installation", quantity: "1", unitPrice: "125.00", lineTotal: "125.00" } },
    },
  });
  await classifyStandaloneInvoiceForMigration({
    invoiceId: invoice.id,
    classification: "non_subscription",
    reason: "Synthetic hardware installation charge; it is not recurring service evidence.",
    ownerUserId: input.owner.id,
  });
  const stored = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { migrationClassificationAudits: true },
  });
  assert.equal(stored.migrationClassification, "non_subscription");
  assert.equal(stored.total.toFixed(2), "125.00");
  assert.equal(stored.amountDue.toFixed(2), "125.00");
  assert.equal(stored.migrationClassificationAudits.length, 1);
  assert.equal(stored.migrationClassificationAudits[0]!.classification, "non_subscription");
  const beforeRecurringEvidence = await getCanonicalMigrationCampaignDashboard();
  assert.equal(beforeRecurringEvidence.candidates.some((candidate) => candidate.sourceId === invoice.id), false);
  await classifyStandaloneInvoiceForMigration({
    invoiceId: invoice.id,
    classification: "recurring_evidence",
    reason: "Synthetic owner confirms this exact invoice documents recurring tracking service.",
    ownerUserId: input.owner.id,
  });
  const afterRecurringEvidence = await getCanonicalMigrationCampaignDashboard();
  assert.equal(afterRecurringEvidence.candidates.some((candidate) => candidate.sourceId === invoice.id), true);
});

test("campaign: owner-reviewed manual migration creates one shadow and preserves legacy authority", async () => {
  const input = await fixture("campaign-success");
  const campaign = await approveIndividual(input);
  const before = {
    invoices: await prisma.invoice.count({ where: { customerId: input.customer.id } }),
    payments: await prisma.payment.count({ where: { customerId: input.customer.id } }),
    schedules: await prisma.recurringInvoiceSchedule.count({ where: { customerId: input.customer.id } }),
  };
  const previous = process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED;
  process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED = "true";
  try {
    const [first, second] = await Promise.all([
      executeOwnerApprovedMigrationCampaign({ campaignId: campaign.id, ownerUserId: input.owner.id, ownerEmail: input.owner.email }),
      executeOwnerApprovedMigrationCampaign({ campaignId: campaign.id, ownerUserId: input.owner.id, ownerEmail: input.owner.email }),
    ]);
    assert.equal(first.migrated + second.migrated, 1);
  } finally {
    if (previous == null) delete process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED;
    else process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED = previous;
  }
  const detail = await getCanonicalMigrationCampaignDetail(campaign.id);
  assert.equal(detail?.status, "completed");
  assert.equal(detail?.entries[0]?.status, "migrated");
  const targetId = detail?.entries[0]?.targetSubscriptionId;
  assert.ok(targetId);
  const target = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: targetId! } });
  assert.equal(target.controlMode, "shadow");
  const schedule = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: input.schedule.id } });
  assert.equal(schedule.status, "active");
  assert.deepEqual(before, {
    invoices: await prisma.invoice.count({ where: { customerId: input.customer.id } }),
    payments: await prisma.payment.count({ where: { customerId: input.customer.id } }),
    schedules: await prisma.recurringInvoiceSchedule.count({ where: { customerId: input.customer.id } }),
  });
});

test("campaign: source changes after owner approval block only that entry without creating billing records", async () => {
  const input = await fixture("campaign-stale");
  const campaign = await approveIndividual(input);
  await prisma.recurringInvoiceSchedule.update({
    where: { id: input.schedule.id },
    data: { nextIssueDate: new Date("2026-12-15T00:00:00.000Z") },
  });
  const previous = process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED;
  process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED = "true";
  try {
    const result = await executeOwnerApprovedMigrationCampaign({ campaignId: campaign.id, ownerUserId: input.owner.id, ownerEmail: input.owner.email });
    assert.equal(result.blocked, 1);
  } finally {
    if (previous == null) delete process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED;
    else process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED = previous;
  }
  const detail = await getCanonicalMigrationCampaignDetail(campaign.id);
  assert.equal(detail?.status, "needs_review");
  assert.equal(detail?.entries[0]?.status, "blocked");
  assert.equal(await prisma.customerSubscription.count({ where: { customerId: input.customer.id, controlMode: "shadow" } }), 0);
  assert.equal(await prisma.invoice.count({ where: { customerId: input.customer.id } }), 0);
});

test("campaign: execution is default-deny until the exact campaign switch is enabled", async () => {
  const input = await fixture("campaign-default-deny");
  const campaign = await approveIndividual(input);
  const previous = process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED;
  delete process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED;
  try {
    await assert.rejects(
      () => executeOwnerApprovedMigrationCampaign({ campaignId: campaign.id, ownerUserId: input.owner.id, ownerEmail: input.owner.email }),
      /execution remains disabled/,
    );
  } finally {
    if (previous != null) process.env.CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED = previous;
  }
  assert.equal(await prisma.customerSubscription.count({ where: { customerId: input.customer.id, controlMode: "shadow" } }), 0);
});

test("simple migration: one owner confirmation atomically transfers manual billing authority", async () => {
  const input = await fixture("simple-migration-success");
  const command = await simpleMigrationInput(input);
  const before = {
    invoices: await prisma.invoice.count({ where: { customerId: input.customer.id } }),
    payments: await prisma.payment.count({ where: { customerId: input.customer.id } }),
  };

  const result = await executeSimpleIndividualMigration(command);
  assert.equal(result.status, "migrated");
  assert.equal(result.alreadyApplied, false);

  const [legacy, target, canonicalSchedules, activation] = await Promise.all([
    prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: input.schedule.id } }),
    prisma.customerSubscription.findUniqueOrThrow({ where: { id: result.targetSubscriptionId } }),
    prisma.recurringInvoiceSchedule.findMany({
      where: { customerId: input.customer.id, customerSubscriptionId: result.targetSubscriptionId },
    }),
    prisma.canonicalManualPilotActivation.findUniqueOrThrow({
      where: { targetSubscriptionId: result.targetSubscriptionId },
    }),
  ]);
  assert.equal(legacy.status, "ended");
  assert.equal(target.controlMode, "canonical");
  assert.equal(activation.status, "active");
  assert.equal(canonicalSchedules.length, 1);
  assert.equal(canonicalSchedules[0]!.status, "active");
  assert.equal(canonicalSchedules[0]!.nextIssueDate.toISOString().slice(0, 10), "2026-11-15");
  assert.deepEqual(before, {
    invoices: await prisma.invoice.count({ where: { customerId: input.customer.id } }),
    payments: await prisma.payment.count({ where: { customerId: input.customer.id } }),
  });

  const retry = await executeSimpleIndividualMigration(command);
  assert.equal(retry.alreadyApplied, true);
  assert.equal(retry.targetSubscriptionId, result.targetSubscriptionId);
  assert.equal(await prisma.recurringInvoiceSchedule.count({
    where: { customerId: input.customer.id, customerSubscriptionId: result.targetSubscriptionId },
  }), 1);

  const dashboard = await getCanonicalMigrationCampaignDashboard();
  const candidate = dashboard.candidates.find((item) => item.sourceId === input.schedule.id);
  assert.equal(candidate?.operationalStatus, "migrated");
});

test("simple migration: a stale confirmation is rejected before shadow or billing changes", async () => {
  const input = await fixture("simple-migration-stale");
  const command = await simpleMigrationInput(input);
  await prisma.recurringInvoiceSchedule.update({
    where: { id: input.schedule.id },
    data: { nextIssueDate: new Date("2026-12-15T00:00:00.000Z") },
  });

  await assert.rejects(
    () => executeSimpleIndividualMigration(command),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "SOURCE_CHANGED_AFTER_REVIEW",
  );
  assert.equal(await prisma.customerSubscription.count({ where: { customerId: input.customer.id } }), 0);
  assert.equal(await prisma.invoice.count({ where: { customerId: input.customer.id } }), 0);
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: input.schedule.id } })).status, "active");
});

test("simple migration: Stripe remains blocked without changing provider or billing authority", async () => {
  const suffix = randomUUID();
  const owner = await prisma.user.create({
    data: { email: `stripe-owner-${suffix}@example.test`, passwordHash: "not-used", name: "Stripe owner" },
  });
  const customer = await prisma.customer.create({
    data: { company: `simple-stripe-${suffix}`, billingMode: "stripe_subscription" },
  });
  const model = await prisma.deviceModel.create({ data: { name: `stripe-model-${suffix}`, retailPrice: "100.00" } });
  const device = await prisma.device.create({ data: { imei: suffix.replaceAll("-", "").slice(0, 15), deviceModelId: model.id } });
  const assignment = await prisma.serviceAssignment.create({
    data: {
      customerId: customer.id,
      deviceId: device.id,
      status: "active",
      intervalMonths: 1,
      startDate: new Date("2026-01-15T00:00:00.000Z"),
      nextDueDate: new Date("2026-11-15T00:00:00.000Z"),
    },
  });
  const legacy = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      controlMode: "legacy",
      status: "active",
      planTermMonths: 1,
      monthlyRateXcd: "30.00",
      vehicleCount: 1,
      currency: "XCD",
      stripeCustomerId: `cus_test_${suffix}`,
      stripeSubscriptionId: `sub_test_${suffix}`,
      currentPeriodStart: new Date("2026-10-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-11-15T00:00:00.000Z"),
    },
  });
  const review = await getCanonicalMigrationProposalReview(`subscription:${legacy.id}`);
  assert.ok(review);

  await assert.rejects(
    () => executeSimpleIndividualMigration({
      proposalId: review.proposal.proposalId,
      expectedReviewFingerprint: review.reviewFingerprint,
      ownerUserId: owner.id,
      ownerEmail: owner.email,
      approvalReason: "Synthetic Stripe review.",
      commercialStartDate: "2026-01-15",
      billingAnchorDate: "2026-10-15",
      nextBillingDate: "2026-11-15",
      gracePeriodDays: 7,
      items: [{
        assignmentId: assignment.id,
        label: "GPS tracking service 1",
        serviceActivatedDate: "2026-01-15",
        agreedAmountPerCycle: "30.00",
        classification: "standard",
      }],
      confirmations: {
        customerAndServicesConfirmed: true,
        commercialTermsConfirmed: true,
        historicalBalancesConfirmed: true,
        billingAuthorityTransferConfirmed: true,
      },
      environment: {
        NODE_ENV: "test",
        CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED: "true",
        CANONICAL_SUBSCRIPTION_ACTIVATION_ENABLED: "true",
      },
    }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "STRIPE_AUTHORITY_TRANSFER_UNAVAILABLE",
  );
  const unchanged = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(unchanged.controlMode, "legacy");
  assert.equal(unchanged.stripeSubscriptionId, `sub_test_${suffix}`);
  assert.equal(await prisma.canonicalMigrationLedger.count({ where: { sourceId: legacy.id } }), 0);
});
