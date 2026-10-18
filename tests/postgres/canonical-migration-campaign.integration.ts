import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../lib/db";
import {
  createOwnerApprovedIndividualMigrationCampaign,
  executeOwnerApprovedMigrationCampaign,
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
