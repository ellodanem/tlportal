import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../lib/db";
import {
  canonicalManualPilotProposalFingerprint,
  CanonicalManualPilotError,
  signCanonicalManualPilotAuthorization,
  signCanonicalManualPilotMigrationAuthorization,
  type CanonicalManualPilotAuthorization,
  type CanonicalManualPilotEnvironment,
  type CanonicalManualPilotMigrationAuthorization,
} from "../../lib/domain/canonical-manual-pilot";
import { CanonicalNativeBillingError } from "../../lib/domain/canonical-native-billing";
import {
  ACTIVATE_MANUAL_PILOT_CONFIRMATION,
  activateCanonicalManualPilot,
  getCanonicalManualPilotReview,
} from "../../lib/services/canonical-manual-pilot-service";
import {
  buildCanonicalManualPilotMigrationPlan,
  getCanonicalManualPilotMigrationReview,
} from "../../lib/services/canonical-manual-pilot-review-service";
import { getCanonicalSubscriptionBillingSummary } from "../../lib/services/canonical-native-billing-service";
import {
  APPLY_MIGRATION_CONFIRMATION,
  CanonicalMigrationExecutionError,
  executeCanonicalMigrationPlan,
} from "../../lib/services/canonical-subscription-migration-service";
import { generateInvoiceFromSchedule } from "../../lib/services/native-recurring-schedule-service";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  CANONICAL_NATIVE_BILLING_ENABLED: process.env.CANONICAL_NATIVE_BILLING_ENABLED,
  CANONICAL_MANUAL_PILOT_ENABLED: process.env.CANONICAL_MANUAL_PILOT_ENABLED,
  CANONICAL_MANUAL_PILOT_CUSTOMER_ID: process.env.CANONICAL_MANUAL_PILOT_CUSTOMER_ID,
  CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID: process.env.CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID,
  CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID: process.env.CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID,
  CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID: process.env.CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID,
  CANONICAL_MANUAL_PILOT_OWNER_EMAIL: process.env.CANONICAL_MANUAL_PILOT_OWNER_EMAIL,
  CANONICAL_MANUAL_PILOT_APPROVAL_SECRET: process.env.CANONICAL_MANUAL_PILOT_APPROVAL_SECRET,
};

const authorizationClock = new Date();
const authorizationIssuedAt = new Date(authorizationClock.getTime() - 60_000).toISOString();
const authorizationExpiresAt = new Date(authorizationClock.getTime() + 60 * 60 * 1000).toISOString();

after(async () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  await prisma.$disconnect();
});

type PilotFixture = Awaited<ReturnType<typeof createPilotFixture>>;

async function createAssignment(input: {
  customerId: string;
  intervalMonths: number;
  nextDueDate: string;
  label: string;
}) {
  const suffix = randomUUID();
  const model = await prisma.deviceModel.create({
    data: { name: `phase4a-${input.label}-${suffix}`, retailPrice: "100.00" },
  });
  const device = await prisma.device.create({
    data: {
      imei: suffix.replaceAll("-", "").slice(0, 15),
      label: input.label,
      deviceModelId: model.id,
    },
  });
  const sim = await prisma.simCard.create({
    data: { iccid: `8901${suffix.replaceAll("-", "").slice(0, 15)}`, label: `${input.label} SIM` },
  });
  return prisma.serviceAssignment.create({
    data: {
      customerId: input.customerId,
      deviceId: device.id,
      simCardId: sim.id,
      intervalMonths: input.intervalMonths,
      status: "active",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      nextDueDate: new Date(`${input.nextDueDate}T00:00:00.000Z`),
    },
  });
}

async function createPilotFixture(options: {
  suffix?: string;
  conflictingRenewal?: boolean;
} = {}) {
  const suffix = options.suffix ?? randomUUID();
  const customer = await prisma.customer.create({
    data: { company: `Phase 4A synthetic ${suffix}`, billingMode: "manual_legacy" },
  });
  const assignments = await Promise.all([
    createAssignment({ customerId: customer.id, intervalMonths: 1, nextDueDate: "2026-11-01", label: "Vehicle A" }),
    createAssignment({ customerId: customer.id, intervalMonths: 1, nextDueDate: options.conflictingRenewal ? "2026-11-02" : "2026-11-01", label: "Vehicle B" }),
    createAssignment({ customerId: customer.id, intervalMonths: 1, nextDueDate: "2026-11-01", label: "Vehicle C" }),
  ]);
  const schedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      status: "active",
      name: `Legacy three-service schedule ${suffix}`,
      currency: "XCD",
      intervalMonths: 1,
      nextIssueDate: new Date("2026-11-01T12:00:00.000Z"),
      dueDaysAfterIssue: 7,
      autoEmail: false,
      lineItems: {
        create: [
          { sortOrder: 0, description: "Vehicle A tracking", quantity: "1", unitPrice: "25.00", lineTotal: "25.00" },
          { sortOrder: 1, description: "Vehicle B tracking", quantity: "1", unitPrice: "25.00", lineTotal: "25.00" },
          { sortOrder: 2, description: "Vehicle C negotiated tracking", quantity: "1", unitPrice: "20.00", lineTotal: "20.00" },
        ],
      },
    },
  });
  const historicalInvoice = await prisma.invoice.create({
    data: {
      customerId: customer.id,
      recurringScheduleId: schedule.id,
      kind: "recurring",
      status: "partially_paid",
      currency: "XCD",
      subtotal: "70.00",
      total: "70.00",
      amountPaid: "20.00",
      amountDue: "50.00",
      issueDate: new Date("2026-10-01T00:00:00.000Z"),
      dueDate: new Date("2026-10-08T00:00:00.000Z"),
    },
  });
  const historicalPayment = await prisma.payment.create({
    data: {
      invoiceId: historicalInvoice.id,
      customerId: customer.id,
      amount: "20.00",
      currency: "XCD",
      method: "cheque",
      reference: `synthetic-${suffix}`,
      receivedAt: new Date("2026-10-05T00:00:00.000Z"),
    },
  });

  const siblingAssignment = await createAssignment({
    customerId: customer.id,
    intervalMonths: 3,
    nextDueDate: "2027-01-01",
    label: "Sibling quarterly service",
  });
  const siblingSchedule = await prisma.recurringInvoiceSchedule.create({
    data: {
      customerId: customer.id,
      serviceAssignmentId: siblingAssignment.id,
      status: "active",
      name: `Sibling legacy schedule ${suffix}`,
      currency: "XCD",
      intervalMonths: 3,
      nextIssueDate: new Date("2027-01-01T12:00:00.000Z"),
      dueDaysAfterIssue: 7,
      autoEmail: false,
      lineItems: { create: { description: "Sibling quarterly tracking", quantity: "1", unitPrice: "60.00", lineTotal: "60.00" } },
    },
  });
  return { customer, assignments, schedule, historicalInvoice, historicalPayment, siblingAssignment, siblingSchedule };
}

async function buildPlan(fixture: PilotFixture) {
  return buildCanonicalManualPilotMigrationPlan({
    proposalId: `schedule:${fixture.schedule.id}`,
    approvedBy: "owner@example.com",
    approvedAt: "2026-10-16T12:00:00.000Z",
    approvalReason: "Synthetic owner confirmed exact schedule, negotiated rates, renewal, and historical balance.",
    name: "Synthetic three-service tracking",
    reference: `pilot-${fixture.schedule.id}`,
    commercialStartDate: "2026-01-01",
    billingAnchorDate: "2026-11-01",
    nextBillingDate: "2026-11-01",
    gracePeriodDays: 7,
    items: [
      { assignmentId: fixture.assignments[0].id, label: "Vehicle A tracking", agreedAmountPerCycle: "25.00", classification: "standard" },
      { assignmentId: fixture.assignments[1].id, label: "Vehicle B tracking", agreedAmountPerCycle: "25.00", classification: "standard" },
      { assignmentId: fixture.assignments[2].id, label: "Vehicle C tracking", agreedAmountPerCycle: "20.00", classification: "negotiated" },
    ],
  }, "2026-10-16");
}

function pilotEnvironment(input: {
  customerId: string;
  subscriptionId: string;
  scheduleId: string;
  production?: boolean;
}): CanonicalManualPilotEnvironment {
  return {
    NODE_ENV: input.production ? "production" : "test",
    VERCEL_ENV: input.production ? "production" : undefined,
    CANONICAL_MANUAL_PILOT_ENABLED: "true",
    CANONICAL_MANUAL_PILOT_CUSTOMER_ID: input.customerId,
    CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID: input.subscriptionId,
    CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID: input.scheduleId,
    CANONICAL_MANUAL_PILOT_OWNER_EMAIL: "owner@example.com",
    CANONICAL_MANUAL_PILOT_APPROVAL_SECRET: "phase-4a-postgres-secret-that-is-at-least-32-bytes",
  };
}

function migrationAuthorization(input: {
  fixture: PilotFixture;
  plan: Awaited<ReturnType<typeof buildPlan>>;
  targetSubscriptionId: string;
  environment: CanonicalManualPilotEnvironment;
  authorizationId?: string;
}): CanonicalManualPilotMigrationAuthorization {
  const entry = input.plan.entries[0];
  const unsigned: Omit<CanonicalManualPilotMigrationAuthorization, "signature"> = {
    authorizationId: input.authorizationId ?? randomUUID(),
    operation: "migrate_manual_pilot_shadow",
    customerId: input.fixture.customer.id,
    targetSubscriptionId: input.targetSubscriptionId,
    sourceKind: "manual_schedule",
    legacyScheduleId: input.fixture.schedule.id,
    sourceInvoiceId: null,
    migrationKey: entry.migrationKey,
    migrationSourceFingerprint: entry.sourceFingerprint,
    migrationPlanFingerprint: input.plan.planFingerprint,
    currency: entry.target.currency,
    billingIntervalMonths: entry.target.billingIntervalMonths,
    recurringAmount: entry.target.expectedTotalAmountPerCycle,
    cutoverPeriodStart: entry.target.nextBillingDate,
    approvedByEmail: "owner@example.com",
    approvalReason: "Synthetic PostgreSQL pilot approval.",
    customerIdentityConfirmed: true,
    commercialTermsConfirmed: true,
    sourceScheduleConfirmed: true,
    historicalBalancesConfirmed: true,
    issuedAt: authorizationIssuedAt,
    expiresAt: authorizationExpiresAt,
  };
  return { ...unsigned, signature: signCanonicalManualPilotMigrationAuthorization(unsigned, input.environment) };
}

async function migrateFixture(fixture: PilotFixture, options: { targetId?: string; authorizationId?: string } = {}) {
  const plan = await buildPlan(fixture);
  const targetSubscriptionId = options.targetId ?? randomUUID();
  const environment = pilotEnvironment({
    customerId: fixture.customer.id,
    subscriptionId: targetSubscriptionId,
    scheduleId: fixture.schedule.id,
    production: true,
  });
  const authorization = migrationAuthorization({
    fixture,
    plan,
    targetSubscriptionId,
    environment,
    authorizationId: options.authorizationId,
  });
  const result = await executeCanonicalMigrationPlan(plan, {
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    environment,
    pilotAuthorization: authorization,
  });
  assert.equal(result.entries[0].targetSubscriptionId, targetSubscriptionId);
  return { plan, targetSubscriptionId, environment, authorization, result };
}

async function activationAuthorization(input: {
  subscriptionId: string;
  environment: CanonicalManualPilotEnvironment;
  authorizationId?: string;
}) {
  const review = await getCanonicalManualPilotReview(input.subscriptionId);
  const unsigned: Omit<CanonicalManualPilotAuthorization, "signature"> = {
    authorizationId: input.authorizationId ?? randomUUID(),
    operation: "activate_manual_pilot",
    proposalFingerprint: canonicalManualPilotProposalFingerprint(review.proposal),
    approvedByEmail: "owner@example.com",
    customerId: review.proposal.customerId,
    subscriptionId: review.proposal.subscriptionId,
    migrationKey: review.proposal.migrationKey,
    sourceKind: review.proposal.sourceKind,
    legacyScheduleId: review.proposal.legacyScheduleId,
    sourceInvoiceId: review.proposal.sourceInvoiceId,
    sourceStateFingerprint: review.proposal.sourceStateFingerprint,
    cutoverPeriodStart: review.proposal.cutoverPeriodStart,
    billingIntervalMonths: review.proposal.billingIntervalMonths,
    currency: review.proposal.currency,
    recurringAmount: review.proposal.recurringAmount,
    approvalReason: "Synthetic owner approved exact authority transfer.",
    customerIdentityConfirmed: true,
    commercialTermsConfirmed: true,
    historicalBalancesConfirmed: true,
    legacyScheduleStopConfirmed: true,
    canonicalScheduleStartConfirmed: true,
    recoveryProcedureConfirmed: true,
    issuedAt: authorizationIssuedAt,
    expiresAt: authorizationExpiresAt,
  };
  return {
    review,
    authorization: {
      ...unsigned,
      signature: signCanonicalManualPilotAuthorization(unsigned, input.environment),
    } satisfies CanonicalManualPilotAuthorization,
  };
}

async function activateFixture(input: {
  subscriptionId: string;
  environment: CanonicalManualPilotEnvironment;
  authorizationId?: string;
}) {
  const { review, authorization } = await activationAuthorization(input);
  const result = await activateCanonicalManualPilot({
    subscriptionId: input.subscriptionId,
    authorization,
    execute: true,
    confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
    environment: input.environment,
    now: authorizationClock,
  });
  return { review, authorization, result };
}

function setRuntimeEnvironment(environment: CanonicalManualPilotEnvironment) {
  Reflect.set(process.env, "NODE_ENV", environment.NODE_ENV);
  if (environment.VERCEL_ENV == null) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = environment.VERCEL_ENV;
  process.env.CANONICAL_NATIVE_BILLING_ENABLED = "true";
  process.env.CANONICAL_MANUAL_PILOT_ENABLED = environment.CANONICAL_MANUAL_PILOT_ENABLED;
  process.env.CANONICAL_MANUAL_PILOT_CUSTOMER_ID = environment.CANONICAL_MANUAL_PILOT_CUSTOMER_ID;
  process.env.CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID = environment.CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID;
  process.env.CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID = environment.CANONICAL_MANUAL_PILOT_SOURCE_SCHEDULE_ID;
  if (environment.CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID == null) delete process.env.CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID;
  else process.env.CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID = environment.CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID;
  process.env.CANONICAL_MANUAL_PILOT_OWNER_EMAIL = environment.CANONICAL_MANUAL_PILOT_OWNER_EMAIL;
  process.env.CANONICAL_MANUAL_PILOT_APPROVAL_SECRET = environment.CANONICAL_MANUAL_PILOT_APPROVAL_SECRET;
}

test("75: signed one-customer pilot preserves history and transfers exactly one billing authority", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  const shadow = await prisma.customerSubscription.findUniqueOrThrow({
    where: { id: migration.targetSubscriptionId },
    include: { items: { include: { rates: true, serviceAssignments: true } } },
  });
  assert.equal(shadow.controlMode, "shadow");
  assert.deepEqual(shadow.items.map((item) => item.rates[0].agreedAmountPerCycle.toFixed(2)).sort(), ["20.00", "25.00", "25.00"]);
  assert.equal(await prisma.invoice.count({ where: { id: fixture.historicalInvoice.id } }), 1);
  assert.equal(await prisma.payment.count({ where: { id: fixture.historicalPayment.id } }), 1);

  const activated = await activateFixture({
    subscriptionId: migration.targetSubscriptionId,
    environment: migration.environment,
  });
  assert.equal(activated.result.recurringAmount, "70.00");
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.schedule.id } })).status, "ended");
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.siblingSchedule.id } })).status, "active");
  const canonicalSchedule = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({
    where: { id: activated.result.canonicalScheduleId },
    include: { lineItems: true },
  });
  assert.equal(canonicalSchedule.status, "active");
  assert.equal(canonicalSchedule.lineItems.length, 0);
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: migration.targetSubscriptionId } })).controlMode, "canonical");
});

test("76: next eligible canonical invoice is exactly EC$70 once and other legacy billing continues", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  const activated = await activateFixture({ subscriptionId: migration.targetSubscriptionId, environment: migration.environment });

  setRuntimeEnvironment({ ...migration.environment, NODE_ENV: "production", VERCEL_ENV: "production" });
  process.env.CANONICAL_MANUAL_PILOT_ENABLED = "false";
  await assert.rejects(
    generateInvoiceFromSchedule(activated.result.canonicalScheduleId, new Date("2026-11-01T12:00:00.000Z")),
    (error: unknown) => error instanceof CanonicalNativeBillingError && error.code === "PRODUCTION_EXECUTION_DISABLED",
  );
  process.env.CANONICAL_MANUAL_PILOT_ENABLED = "true";
  const generated = await generateInvoiceFromSchedule(
    activated.result.canonicalScheduleId,
    new Date("2026-11-01T12:00:00.000Z"),
  );
  assert.equal(generated.skipped, false);
  if (generated.skipped) assert.fail("Expected canonical invoice generation.");
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: generated.invoiceId },
    include: { serviceSnapshots: { include: { subscriptionItemRate: true } } },
  });
  assert.equal(invoice.total.toFixed(2), "70.00");
  assert.equal(invoice.serviceSnapshots.length, 3);
  assert.equal(invoice.serviceSnapshots.filter((snapshot) => snapshot.subscriptionItemRate?.classification === "negotiated").length, 1);

  const replay = await generateInvoiceFromSchedule(
    activated.result.canonicalScheduleId,
    new Date("2026-11-01T12:00:00.000Z"),
    { skipIfNoLongerDue: true },
  );
  assert.equal(replay.skipped, true);
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: migration.targetSubscriptionId } }), 1);
  await assert.rejects(generateInvoiceFromSchedule(fixture.schedule.id, new Date("2026-11-01T12:00:00.000Z")));

  const sibling = await generateInvoiceFromSchedule(fixture.siblingSchedule.id, new Date("2027-01-01T12:00:00.000Z"));
  assert.equal(sibling.skipped, false);
  if (!sibling.skipped) {
    const siblingInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: sibling.invoiceId } });
    assert.equal(siblingInvoice.total.toFixed(2), "60.00");
    assert.equal(siblingInvoice.customerSubscriptionId, null);
  }
});

test("77: concurrent and replayed activation requests create one canonical schedule", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  const prepared = await activationAuthorization({
    subscriptionId: migration.targetSubscriptionId,
    environment: migration.environment,
  });
  const calls = Array.from({ length: 6 }, () => activateCanonicalManualPilot({
    subscriptionId: migration.targetSubscriptionId,
    authorization: prepared.authorization,
    execute: true,
    confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
    environment: migration.environment,
    now: authorizationClock,
  }));
  const results = await Promise.all(calls);
  assert.equal(new Set(results.map((result) => result.canonicalScheduleId)).size, 1);
  assert.equal(results.filter((result) => !result.alreadyApplied).length, 1);
  assert.equal(await prisma.canonicalManualPilotActivation.count({ where: { targetSubscriptionId: migration.targetSubscriptionId } }), 1);
  assert.equal(await prisma.recurringInvoiceSchedule.count({
    where: { customerSubscriptionId: migration.targetSubscriptionId, status: "active" },
  }), 1);
});

test("78: stale source fingerprint blocks cutover without changing billing authority", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  const prepared = await activationAuthorization({ subscriptionId: migration.targetSubscriptionId, environment: migration.environment });
  await prisma.recurringInvoiceSchedule.update({
    where: { id: fixture.schedule.id },
    data: { notes: "Source changed after approval" },
  });
  await assert.rejects(
    activateCanonicalManualPilot({
      subscriptionId: migration.targetSubscriptionId,
      authorization: prepared.authorization,
      execute: true,
      confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
      environment: migration.environment,
      now: authorizationClock,
    }),
    (error: unknown) => error instanceof CanonicalManualPilotError
      && error.code === "PILOT_APPROVAL_BINDING_MISMATCH",
  );
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.schedule.id } })).status, "active");
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: migration.targetSubscriptionId } })).controlMode, "shadow");
});

test("79: a transaction failure rolls back schedule and control changes and remains retryable", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  const prepared = await activationAuthorization({ subscriptionId: migration.targetSubscriptionId, environment: migration.environment });
  const functionName = `phase4a_fail_${randomUUID().replaceAll("-", "")}`;
  const triggerName = `${functionName}_trigger`;
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      IF NEW."id" = '${migration.targetSubscriptionId}' AND NEW."controlMode" = 'canonical' THEN
        RAISE EXCEPTION 'synthetic phase 4a cutover failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE UPDATE ON "CustomerSubscription"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
  `);
  try {
    await assert.rejects(activateCanonicalManualPilot({
      subscriptionId: migration.targetSubscriptionId,
      authorization: prepared.authorization,
      execute: true,
      confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
      environment: migration.environment,
      now: authorizationClock,
    }), /synthetic phase 4a cutover failure/);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "CustomerSubscription"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
  }
  assert.equal((await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.schedule.id } })).status, "active");
  assert.equal(await prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: migration.targetSubscriptionId } }), 0);
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: migration.targetSubscriptionId } })).controlMode, "shadow");
  assert.equal((await prisma.canonicalManualPilotActivation.findUniqueOrThrow({
    where: { targetSubscriptionId: migration.targetSubscriptionId },
  })).status, "failed_rolled_back");

  const retried = await activateCanonicalManualPilot({
    subscriptionId: migration.targetSubscriptionId,
    authorization: prepared.authorization,
    execute: true,
    confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
    environment: migration.environment,
    now: authorizationClock,
  });
  assert.equal(retried.status, "active");
  assert.equal(await prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: migration.targetSubscriptionId } }), 1);
});

test("80: historical partial balance contributes to collection attention without suspending service", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  await activateFixture({ subscriptionId: migration.targetSubscriptionId, environment: migration.environment });
  const summary = await getCanonicalSubscriptionBillingSummary(
    migration.targetSubscriptionId,
    new Date("2026-10-20T00:00:00.000Z"),
    { ...migration.environment, NODE_ENV: "production", VERCEL_ENV: "production" },
  );
  assert.equal(summary.outstandingBalance, "50.00");
  assert.equal(summary.collectionHealth, "action_required");
  assert.equal(summary.attentionRequired, true);
  assert.equal(summary.eligibleForExecution, true);
  assert.ok((await prisma.subscriptionItem.findMany({ where: { customerSubscriptionId: migration.targetSubscriptionId } }))
    .every((item) => item.status === "active"));
  assert.ok((await prisma.serviceAssignment.findMany({ where: { id: { in: fixture.assignments.map((assignment) => assignment.id) } } }))
    .every((assignment) => assignment.status === "active"));
});

test("81: missing price evidence and conflicting renewals remain explicit review issues", async () => {
  const fixture = await createPilotFixture({ conflictingRenewal: true });
  const review = await getCanonicalManualPilotMigrationReview(`schedule:${fixture.schedule.id}`, "2026-10-16");
  const issueCodes = new Set([...review.proposal.issues.map((issue) => issue.code), ...review.candidate.issueCodes]);
  assert.ok(issueCodes.has("heterogeneous_schedule_rates"));
  assert.ok(issueCodes.has("conflicting_assignment_renewals"));
  assert.ok(review.assignments.some((assignment) => assignment.suggestedAmount == null));
  await assert.rejects(buildCanonicalManualPilotMigrationPlan({
    proposalId: `schedule:${fixture.schedule.id}`,
    approvedBy: "owner@example.com",
    approvedAt: "2026-10-16T12:00:00.000Z",
    approvalReason: "Incomplete price evidence must not be guessed.",
    name: "Blocked plan",
    reference: "blocked",
    commercialStartDate: "2026-01-01",
    billingAnchorDate: "2026-11-01",
    nextBillingDate: "2026-11-01",
    gracePeriodDays: 7,
    items: [{ assignmentId: fixture.assignments[0].id, label: "Missing price", agreedAmountPerCycle: "", classification: "negotiated" }],
  }, "2026-10-16"));
});

test("82: a second subscription for the same customer remains independent", async () => {
  const fixture = await createPilotFixture();
  const migration = await migrateFixture(fixture);
  await activateFixture({ subscriptionId: migration.targetSubscriptionId, environment: migration.environment });
  const sibling = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.siblingSchedule.id } });
  assert.equal(sibling.status, "active");
  assert.equal(sibling.customerSubscriptionId, null);
  assert.equal(sibling.nextIssueDate.toISOString().slice(0, 10), "2027-01-01");
  assert.equal((await prisma.serviceAssignment.findUniqueOrThrow({ where: { id: fixture.siblingAssignment.id } })).subscriptionItemId, null);
});

test("83: production migration cannot be enabled by broad flags without exact signed pilot authorization", async () => {
  const fixture = await createPilotFixture();
  const plan = await buildPlan(fixture);
  await assert.rejects(
    executeCanonicalMigrationPlan(plan, {
      execute: true,
      confirmation: APPLY_MIGRATION_CONFIRMATION,
      environment: {
        NODE_ENV: "production",
        VERCEL: "1",
        DATABASE_URL: process.env.DATABASE_URL,
        ALLOW_CANONICAL_MIGRATION_EXECUTION: "true",
      },
    }),
    (error: unknown) => error instanceof Error && /blocked in production/i.test(error.message),
  );
  assert.equal(await prisma.canonicalMigrationLedger.count({ where: { sourceId: fixture.schedule.id } }), 0);
  assert.equal(await prisma.customerSubscription.count({ where: { customerId: fixture.customer.id } }), 0);
});

test("84: signed pilot approval cannot adopt a completed migration with a different target subscription", async () => {
  const fixture = await createPilotFixture();
  const plan = await buildPlan(fixture);
  const completed = await executeCanonicalMigrationPlan(plan, {
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    environment: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOW_CANONICAL_MIGRATION_EXECUTION: "true",
    },
  });
  const authorizedTargetId = randomUUID();
  assert.notEqual(completed.entries[0].targetSubscriptionId, authorizedTargetId);
  const environment = pilotEnvironment({
    customerId: fixture.customer.id,
    subscriptionId: authorizedTargetId,
    scheduleId: fixture.schedule.id,
    production: true,
  });
  const authorization = migrationAuthorization({
    fixture,
    plan,
    targetSubscriptionId: authorizedTargetId,
    environment,
  });

  await assert.rejects(
    executeCanonicalMigrationPlan(plan, {
      execute: true,
      confirmation: APPLY_MIGRATION_CONFIRMATION,
      environment,
      pilotAuthorization: authorization,
    }),
    (error: unknown) => error instanceof CanonicalMigrationExecutionError
      && error.code === "PILOT_TARGET_SUBSCRIPTION_MISMATCH",
  );
  assert.equal(await prisma.customerSubscription.count({ where: { customerId: fixture.customer.id } }), 1);
});

async function createEstablishedManualInvoiceFixture() {
  const suffix = randomUUID();
  const customer = await prisma.customer.create({
    data: { company: `Established cheque pilot ${suffix}`, billingMode: "manual_legacy" },
  });
  const assignments = await Promise.all(Array.from({ length: 14 }, (_, index) => createAssignment({
    customerId: customer.id,
    intervalMonths: 3,
    nextDueDate: "2027-01-15",
    label: `Quarterly vehicle ${index + 1}`,
  })));
  const sourceInvoice = await prisma.invoice.create({
    data: {
      customerId: customer.id,
      kind: "one_off",
      status: "open",
      currency: "XCD",
      subtotal: "840.00",
      taxTotal: "0.00",
      total: "840.00",
      amountPaid: "0.00",
      amountDue: "840.00",
      issueDate: new Date("2026-10-09T00:00:00.000Z"),
      dueDate: new Date("2026-11-14T00:00:00.000Z"),
      paymentInstructions: "Pay by cheque.",
      lineItems: { create: {
        description: "GPS Tracker 3-Month Subscription (14 devices)",
        quantity: "3",
        unitPrice: "280.00",
        lineTotal: "840.00",
      } },
    },
  });
  return { customer, assignments, sourceInvoice };
}

async function buildEstablishedManualInvoicePlan(fixture: Awaited<ReturnType<typeof createEstablishedManualInvoiceFixture>>) {
  return buildCanonicalManualPilotMigrationPlan({
    proposalId: `manual-invoice:${fixture.sourceInvoice.id}`,
    approvedBy: "owner@example.com",
    approvedAt: "2026-10-16T12:00:00.000Z",
    approvalReason: "Owner confirmed 14 active devices at EC$60 each per quarterly cycle; the EC$840 source invoice is cheque-only and tax exempt.",
    name: "Established quarterly tracking",
    reference: `manual-invoice-${fixture.sourceInvoice.id}`,
    commercialStartDate: "2026-01-15",
    billingAnchorDate: "2026-10-15",
    nextBillingDate: "2027-01-15",
    sourceCoverageStartDate: "2026-10-15",
    sourceCoverageEndDate: "2027-01-15",
    sourceCoverageConfirmed: true,
    gracePeriodDays: 7,
    items: fixture.assignments.map((assignment, index) => ({
      assignmentId: assignment.id,
      label: `Quarterly tracking ${index + 1}`,
      agreedAmountPerCycle: "60.00",
      classification: "negotiated" as const,
    })),
  }, "2026-10-16");
}

function manualInvoicePilotEnvironment(input: { customerId: string; subscriptionId: string; invoiceId: string }) {
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    CANONICAL_MANUAL_PILOT_ENABLED: "true",
    CANONICAL_MANUAL_PILOT_CUSTOMER_ID: input.customerId,
    CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID: input.subscriptionId,
    CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID: input.invoiceId,
    CANONICAL_MANUAL_PILOT_OWNER_EMAIL: "owner@example.com",
    CANONICAL_MANUAL_PILOT_APPROVAL_SECRET: "phase-4a-postgres-secret-that-is-at-least-32-bytes",
  } satisfies CanonicalManualPilotEnvironment;
}

function manualInvoiceMigrationAuthorization(input: {
  fixture: Awaited<ReturnType<typeof createEstablishedManualInvoiceFixture>>;
  plan: Awaited<ReturnType<typeof buildEstablishedManualInvoicePlan>>;
  targetSubscriptionId: string;
  environment: CanonicalManualPilotEnvironment;
}): CanonicalManualPilotMigrationAuthorization {
  const entry = input.plan.entries[0];
  const unsigned: Omit<CanonicalManualPilotMigrationAuthorization, "signature"> = {
    authorizationId: randomUUID(),
    operation: "migrate_manual_pilot_shadow",
    customerId: input.fixture.customer.id,
    targetSubscriptionId: input.targetSubscriptionId,
    sourceKind: "manual_invoice",
    legacyScheduleId: null,
    sourceInvoiceId: input.fixture.sourceInvoice.id,
    migrationKey: entry.migrationKey,
    migrationSourceFingerprint: entry.sourceFingerprint,
    migrationPlanFingerprint: input.plan.planFingerprint,
    currency: "XCD",
    billingIntervalMonths: 3,
    recurringAmount: "840.00",
    cutoverPeriodStart: "2027-01-15",
    approvedByEmail: "owner@example.com",
    approvalReason: "Synthetic exact owner authorization for established cheque arrangement.",
    customerIdentityConfirmed: true,
    commercialTermsConfirmed: true,
    sourceScheduleConfirmed: true,
    historicalBalancesConfirmed: true,
    issuedAt: authorizationIssuedAt,
    expiresAt: authorizationExpiresAt,
  };
  return { ...unsigned, signature: signCanonicalManualPilotMigrationAuthorization(unsigned, input.environment) };
}

test("85: a 3 × EC$280 aggregate monthly manual invoice produces a 14-service shadow and January canonical schedule", async () => {
  const fixture = await createEstablishedManualInvoiceFixture();
  const review = await getCanonicalManualPilotMigrationReview(`manual-invoice:${fixture.sourceInvoice.id}`, "2026-10-16");
  assert.equal(review.candidate.sourceKind, "manual_invoice");
  assert.equal(review.assignments.length, 14);
  assert.equal(review.sourceInvoice?.subtotal, "840.00");
  assert.equal(review.sourceInvoice?.taxTotal, "0.00");
  assert.equal(review.sourceInvoice?.issueDate.slice(0, 10), "2026-10-09");

  const plan = await buildEstablishedManualInvoicePlan(fixture);
  assert.equal(plan.entries[0].sourceKind, "manual_invoice");
  assert.equal(plan.entries[0].target.expectedTotalAmountPerCycle, "840.00");
  assert.equal(plan.entries[0].target.items.length, 14);
  assert.ok(plan.entries[0].target.items.every((item) => item.agreedAmountPerCycle === "60.00"));
  assert.deepEqual(plan.entries[0].target.sourceInvoiceCoverageConfirmation, {
    periodStart: "2026-10-15",
    periodEnd: "2027-01-15",
    explicitlyConfirmed: true,
  });
  const originalBeforeMigration = await prisma.invoice.findUniqueOrThrow({
    where: { id: fixture.sourceInvoice.id },
    include: { lineItems: true },
  });
  assert.equal(originalBeforeMigration.lineItems[0].quantity.toFixed(0), "3");
  assert.equal(originalBeforeMigration.lineItems[0].unitPrice.toFixed(2), "280.00");
  assert.equal(originalBeforeMigration.lineItems[0].lineTotal.toFixed(2), "840.00");
  const targetSubscriptionId = randomUUID();
  const environment = manualInvoicePilotEnvironment({
    customerId: fixture.customer.id,
    subscriptionId: targetSubscriptionId,
    invoiceId: fixture.sourceInvoice.id,
  });
  await executeCanonicalMigrationPlan(plan, {
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    environment,
    pilotAuthorization: manualInvoiceMigrationAuthorization({ fixture, plan, targetSubscriptionId, environment }),
  });
  assert.equal(await prisma.invoice.count({ where: { id: fixture.sourceInvoice.id } }), 1);
  assert.equal(await prisma.invoice.count({ where: { customerId: fixture.customer.id } }), 1);
  assert.equal(await prisma.payment.count({ where: { invoiceId: fixture.sourceInvoice.id } }), 0);
  assert.equal(await prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: targetSubscriptionId } }), 0);
  const originalAfterMigration = await prisma.invoice.findUniqueOrThrow({
    where: { id: fixture.sourceInvoice.id },
    include: { lineItems: true },
  });
  assert.equal(originalAfterMigration.issueDate.toISOString().slice(0, 10), "2026-10-09");
  assert.equal(originalAfterMigration.lineItems[0].quantity.toFixed(0), "3");
  assert.equal(originalAfterMigration.lineItems[0].unitPrice.toFixed(2), "280.00");
  assert.equal(originalAfterMigration.lineItems[0].lineTotal.toFixed(2), "840.00");

  const prepared = await activationAuthorization({ subscriptionId: targetSubscriptionId, environment });
  const activated = await activateCanonicalManualPilot({
    subscriptionId: targetSubscriptionId,
    authorization: prepared.authorization,
    execute: true,
    confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
    environment,
    now: authorizationClock,
  });
  assert.equal(activated.sourceKind, "manual_invoice");
  assert.equal(activated.legacyScheduleId, null);
  assert.equal(activated.sourceInvoiceId, fixture.sourceInvoice.id);
  const schedule = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: activated.canonicalScheduleId } });
  assert.equal(schedule.nextIssueDate.toISOString().slice(0, 10), "2027-01-15");
  assert.equal(schedule.intervalMonths, 3);
  assert.equal(schedule.taxRatePercent, null);

  setRuntimeEnvironment(environment);
  const generated = await generateInvoiceFromSchedule(schedule.id, new Date("2027-01-15T00:00:00.000Z"));
  assert.equal(generated.skipped, false);
  if (!generated.skipped) {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: generated.invoiceId }, include: { serviceSnapshots: true } });
    assert.equal(invoice.subtotal.toFixed(2), "840.00");
    assert.equal(invoice.total.toFixed(2), "840.00");
    assert.equal(invoice.serviceSnapshots.length, 14);
  }
});

test("85a: explicit invoice coverage accepts legacy assignments still marked at the coverage start", async () => {
  const fixture = await createEstablishedManualInvoiceFixture();
  await prisma.serviceAssignment.updateMany({
    where: { id: { in: fixture.assignments.slice(0, 12).map((assignment) => assignment.id) } },
    data: { nextDueDate: new Date("2026-10-15T00:00:00.000Z") },
  });

  const plan = await buildEstablishedManualInvoicePlan(fixture);
  assert.equal(plan.entries[0].target.nextBillingDate, "2027-01-15");
  assert.equal(plan.entries[0].target.items.length, 14);
  assert.ok(plan.entries[0].target.items.every((item) => item.agreedAmountPerCycle === "60.00"));
});

test("86: a future regular invoice blocks manual-invoice cutover and preserves the original invoice", async () => {
  const fixture = await createEstablishedManualInvoiceFixture();
  const plan = await buildEstablishedManualInvoicePlan(fixture);
  const targetSubscriptionId = randomUUID();
  const environment = manualInvoicePilotEnvironment({ customerId: fixture.customer.id, subscriptionId: targetSubscriptionId, invoiceId: fixture.sourceInvoice.id });
  await executeCanonicalMigrationPlan(plan, {
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    environment,
    pilotAuthorization: manualInvoiceMigrationAuthorization({ fixture, plan, targetSubscriptionId, environment }),
  });
  await prisma.invoice.create({
    data: {
      customerId: fixture.customer.id,
      kind: "one_off",
      status: "open",
      currency: "XCD",
      subtotal: "840.00",
      total: "840.00",
      amountDue: "840.00",
      issueDate: new Date("2027-01-10T00:00:00.000Z"),
    },
  });
  const prepared = await activationAuthorization({ subscriptionId: targetSubscriptionId, environment });
  await assert.rejects(activateCanonicalManualPilot({
    subscriptionId: targetSubscriptionId,
    authorization: prepared.authorization,
    execute: true,
    confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
    environment,
    now: authorizationClock,
  }), (error: unknown) => error instanceof CanonicalManualPilotError && error.code === "PILOT_CUTOVER_PERIOD_ALREADY_BILLED");
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: targetSubscriptionId } })).controlMode, "shadow");
  assert.equal(await prisma.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: targetSubscriptionId } }), 0);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: fixture.sourceInvoice.id } })).total.toFixed(2), "840.00");
});

test("87: established manual-invoice preparation rejects incomplete or repriced service mappings", async () => {
  const fixture = await createEstablishedManualInvoiceFixture();
  const base = {
    proposalId: `manual-invoice:${fixture.sourceInvoice.id}`,
    approvedBy: "owner@example.com",
    approvedAt: "2026-10-16T12:00:00.000Z",
    approvalReason: "Verify exact source quantities and prices.",
    name: "Blocked established arrangement",
    reference: "blocked-established-invoice",
    commercialStartDate: "2026-01-15",
    billingAnchorDate: "2026-10-15",
    nextBillingDate: "2027-01-15",
    sourceCoverageStartDate: "2026-10-15",
    sourceCoverageEndDate: "2027-01-15",
    sourceCoverageConfirmed: true,
    gracePeriodDays: 7,
  };
  await assert.rejects(buildCanonicalManualPilotMigrationPlan({
    ...base,
    items: fixture.assignments.slice(0, 13).map((assignment, index) => ({
      assignmentId: assignment.id,
      label: `Quarterly tracking ${index + 1}`,
      agreedAmountPerCycle: "60.00",
      classification: "negotiated" as const,
    })),
  }, "2026-10-16"), /Every authorized active service/);
  await assert.rejects(buildCanonicalManualPilotMigrationPlan({
    ...base,
    items: fixture.assignments.map((assignment, index) => ({
      assignmentId: assignment.id,
      label: `Quarterly tracking ${index + 1}`,
      agreedAmountPerCycle: index === 0 ? "61.00" : index === 1 ? "59.00" : "60.00",
      classification: "negotiated" as const,
    })),
  }, "2026-10-16"), /exact per-service cycle amount derived from the aggregate invoice subtotal/);
});

test("88: aggregate manual invoice validation rejects unconfirmed coverage and duration mismatches", async () => {
  const fixture = await createEstablishedManualInvoiceFixture();
  const base = {
    proposalId: `manual-invoice:${fixture.sourceInvoice.id}`,
    approvedBy: "owner@example.com",
    approvedAt: "2026-10-16T12:00:00.000Z",
    approvalReason: "Verify aggregate monthly fleet evidence.",
    name: "Aggregate validation arrangement",
    reference: "aggregate-validation",
    commercialStartDate: "2026-01-15",
    billingAnchorDate: "2026-10-15",
    nextBillingDate: "2027-01-15",
    sourceCoverageStartDate: "2026-10-16",
    sourceCoverageEndDate: "2027-01-15",
    sourceCoverageConfirmed: false,
    gracePeriodDays: 7,
    items: fixture.assignments.map((assignment, index) => ({
      assignmentId: assignment.id,
      label: `Quarterly tracking ${index + 1}`,
      agreedAmountPerCycle: "60.00",
      classification: "negotiated" as const,
    })),
  };
  await assert.rejects(
    buildCanonicalManualPilotMigrationPlan(base, "2026-10-16"),
    /coverage start and end dates require explicit staff confirmation/,
  );
  await prisma.invoiceLineItem.updateMany({
    where: { invoiceId: fixture.sourceInvoice.id },
    data: { quantity: "2", lineTotal: "560.00" },
  });
  await assert.rejects(
    buildCanonicalManualPilotMigrationPlan({ ...base, sourceCoverageStartDate: "2026-10-15", sourceCoverageConfirmed: true }, "2026-10-16"),
    /itemize one unit per approved service or use one verified duration-times-aggregate-fleet line/,
  );
  const original = await prisma.invoice.findUniqueOrThrow({
    where: { id: fixture.sourceInvoice.id },
    include: { lineItems: true },
  });
  assert.equal(original.subtotal.toFixed(2), "840.00");
  assert.equal(original.total.toFixed(2), "840.00");
  assert.equal(original.lineItems[0].quantity.toFixed(0), "2");
  assert.equal(original.lineItems[0].lineTotal.toFixed(2), "560.00");
});

test("89: an established invoice remains reviewable when a canceled historical source exists", async () => {
  const fixture = await createEstablishedManualInvoiceFixture();
  await prisma.customerSubscription.create({
    data: {
      customerId: fixture.customer.id,
      planTermMonths: 3,
      status: "canceled",
      monthlyRateXcd: "20.00",
      vehicleCount: 14,
      currentPeriodStart: new Date("2026-10-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2027-01-15T00:00:00.000Z"),
    },
  });

  const review = await getCanonicalManualPilotMigrationReview(
    `manual-invoice%3A${fixture.sourceInvoice.id}`,
    "2026-10-16",
  );
  assert.equal(review.candidate.proposalId, `manual-invoice:${fixture.sourceInvoice.id}`);
  assert.equal(review.assignments.length, 14);
  assert.equal(review.sourceInvoice?.id, fixture.sourceInvoice.id);
  assert.equal(review.candidate.issueDetails.some((issue) => issue.code === "multiple_arrangements_same_interval"), false);
  assert.equal(review.candidate.issueDetails.some((issue) => issue.code === "active_assignments_unmapped"), false);
  assert.equal(review.candidate.proposedItemCount, 14);
  assert.equal(await prisma.invoice.count({ where: { id: fixture.sourceInvoice.id } }), 1);
});
