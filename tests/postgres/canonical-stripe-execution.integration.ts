import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/db";
import type {
  CanonicalStripeCheckoutSession,
  CanonicalStripeOperationProposal,
  CanonicalStripeProviderAdapter,
  CanonicalStripeProviderMutationResult,
} from "../../lib/domain/canonical-stripe-execution";
import { buildCanonicalStripeRateGroups, type ObservedStripeSubscription } from "../../lib/domain/canonical-stripe-shadow";
import {
  asCanonicalStripeLiveCanaryProposal,
  canonicalStripeLiveCanaryProposalDigest,
  LIVE_CANARY_PROVIDER_CONTEXT,
  signCanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "../../lib/domain/canonical-stripe-live-canary";
import {
  approveCanonicalStripeOperation,
  executeCanonicalStripeActivation,
  executeCanonicalStripeSynchronization,
  getCanonicalStripeExecutionProposal,
} from "../../lib/services/canonical-stripe-execution-service";
import {
  handleCanonicalStripeNormalizedWebhook,
  tryHandleCanonicalStripeLiveCanaryWebhookEvent,
  type CanonicalStripeInvoiceWebhook,
} from "../../lib/services/canonical-stripe-webhook-service";
import type Stripe from "stripe";

const originalExecutionFlag = process.env.CANONICAL_STRIPE_EXECUTION_ENABLED;
process.env.CANONICAL_STRIPE_EXECUTION_ENABLED = "true";

after(async () => {
  if (originalExecutionFlag == null) delete process.env.CANONICAL_STRIPE_EXECUTION_ENABLED;
  else process.env.CANONICAL_STRIPE_EXECUTION_ENABLED = originalExecutionFlag;
  await prisma.$disconnect();
});

type FixtureItem = {
  label: string;
  amount: string;
  classification?: "standard" | "negotiated";
  billingFrom?: string;
};

async function createFixture(input: {
  customerId?: string;
  lifecycle?: "pending_activation" | "active";
  controlMode?: "legacy" | "shadow" | "canonical";
  interval?: 1 | 3 | 6 | 12;
  nextBillingDate?: string;
  items?: FixtureItem[];
  withProvider?: boolean;
  observedQuantities?: Record<string, number>;
  obsoleteProviderGroup?: boolean;
} = {}) {
  const customer = input.customerId
    ? await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } })
    : await prisma.customer.create({ data: { company: `Phase 3B2 ${randomUUID()}` } });
  const lifecycle = input.lifecycle ?? "active";
  const interval = input.interval ?? 1;
  const nextBillingDate = new Date(`${input.nextBillingDate ?? (interval === 12 ? "2027-01-01" : "2026-11-01")}T00:00:00.000Z`);
  const itemInputs = input.items ?? [
    { label: "Standard A", amount: "25.00" },
    { label: "Standard B", amount: "25.00" },
    { label: "Negotiated C", amount: "20.00", classification: "negotiated" as const },
  ];
  const subscription = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      name: `Canonical Stripe ${randomUUID()}`,
      collectionMethod: "stripe_autocharge",
      lifecycleStatus: lifecycle,
      collectionHealth: "not_started",
      billingIntervalMonths: interval,
      currency: "XCD",
      agreedAmountPerCycle: itemInputs[0]?.amount ?? "0.00",
      commercialStartDate: new Date("2026-01-01T00:00:00.000Z"),
      billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
      nextBillingDate,
      controlMode: input.controlMode ?? "canonical",
      status: lifecycle === "active" ? "active" : "pending_payment",
      planTermMonths: interval,
    },
  });
  for (const item of itemInputs) {
    const billingFrom = new Date(`${item.billingFrom ?? "2026-01-01"}T00:00:00.000Z`);
    await prisma.subscriptionItem.create({
      data: {
        customerSubscriptionId: subscription.id,
        label: item.label,
        status: lifecycle === "pending_activation" ? "pending_activation" : "active",
        serviceActivatedDate: billingFrom,
        billingEffectiveFrom: billingFrom,
        rates: {
          create: {
            billingIntervalMonths: interval,
            agreedAmountPerCycle: item.amount,
            currency: "XCD",
            effectiveFrom: billingFrom,
            classification: item.classification ?? "standard",
          },
        },
      },
    });
  }
  const loaded = await prisma.customerSubscription.findUniqueOrThrow({
    where: { id: subscription.id },
    include: { items: { include: { rates: true } } },
  });
  const expected = input.controlMode === "legacy"
    ? null
    : buildCanonicalStripeRateGroups(loaded, nextBillingDate, { requireActive: false });
  let providerLink: Awaited<ReturnType<typeof prisma.subscriptionProviderLink.create>> & {
    providerItems: Awaited<ReturnType<typeof prisma.subscriptionProviderItem.findMany>>;
  } | null = null;
  let observed: ObservedStripeSubscription | null = null;
  if (input.withProvider && expected) {
    const externalSubscriptionId = `sub_${randomUUID()}`;
    providerLink = await prisma.subscriptionProviderLink.create({
      data: {
        customerSubscriptionId: subscription.id,
        provider: "stripe",
        externalSubscriptionId,
        providerStatus: "active",
        activatedAt: new Date("2026-01-01T00:00:00.000Z"),
        providerItems: {
          create: [
            ...expected.groups.map((group) => ({
              externalSubscriptionItemId: `si_${randomUUID()}`,
              externalPriceId: `price_${randomUUID()}`,
              currency: group.currency,
              billingIntervalMonths: group.billingIntervalMonths,
              agreedAmountPerCycle: group.agreedAmountPerCycle,
              quantity: group.quantity,
              rateGroupFingerprint: group.fingerprint,
            })),
            ...(input.obsoleteProviderGroup ? [{
              externalSubscriptionItemId: `si_obsolete_${randomUUID()}`,
              externalPriceId: `price_obsolete_${randomUUID()}`,
              currency: "XCD",
              billingIntervalMonths: interval,
              agreedAmountPerCycle: new Prisma.Decimal("30.00"),
              quantity: 1,
              rateGroupFingerprint: `XCD:${interval}:30.00`,
            }] : []),
          ],
        },
      },
      include: { providerItems: { orderBy: { rateGroupFingerprint: "asc" } } },
    });
    const periodStart = new Date(nextBillingDate);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - interval);
    observed = {
      externalSubscriptionId,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: nextBillingDate,
      items: providerLink.providerItems.map((mapping) => ({
        externalSubscriptionItemId: mapping.externalSubscriptionItemId,
        externalPriceId: mapping.externalPriceId,
        currency: mapping.currency,
        billingIntervalMonths: mapping.billingIntervalMonths,
        unitAmount: mapping.agreedAmountPerCycle,
        quantity: input.observedQuantities?.[mapping.rateGroupFingerprint] ?? mapping.quantity,
      })),
    };
  }
  return { customer, subscription, expected, providerLink, observed };
}

function providerResultFromProposal(
  proposal: CanonicalStripeOperationProposal,
  externalSubscriptionId: string,
): CanonicalStripeProviderMutationResult {
  const periodStart = new Date(proposal.nextBillingDate);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - proposal.billingIntervalMonths);
  const rateGroups = proposal.rateGroups.map((group, index) => ({
    fingerprint: group.fingerprint,
    externalSubscriptionItemId: `si_result_${index}_${externalSubscriptionId}`,
    externalPriceId: `price_result_${index}_${externalSubscriptionId}`,
    currency: group.currency,
    billingIntervalMonths: group.billingIntervalMonths,
    agreedAmountPerCycle: group.agreedAmountPerCycle,
    quantity: group.quantity,
  }));
  return {
    subscription: {
      externalSubscriptionId,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: proposal.nextBillingDate,
      cancelAtPeriodEnd: false,
      items: rateGroups.map((group) => ({
        externalSubscriptionItemId: group.externalSubscriptionItemId,
        externalPriceId: group.externalPriceId,
        currency: group.currency,
        billingIntervalMonths: group.billingIntervalMonths,
        unitAmount: group.agreedAmountPerCycle,
        quantity: group.quantity,
      })),
    },
    rateGroups,
  };
}

class MockCanonicalStripeAdapter implements CanonicalStripeProviderAdapter {
  readonly liveCanaryAuthorizationId?: string;

  constructor(
    readonly kind: "mock" | "stripe_test" | "stripe_live_canary" = "mock",
    liveCanaryAuthorizationId?: string,
  ) {
    this.liveCanaryAuthorizationId = liveCanaryAuthorizationId;
  }
  sessions = new Map<string, CanonicalStripeCheckoutSession>();
  activationByOperation = new Map<string, string>();
  synchronizationByOperation = new Map<string, CanonicalStripeProviderMutationResult>();
  subscriptions = new Map<string, ObservedStripeSubscription>();
  activationCreates = 0;
  synchronizationCalls = 0;
  timeoutAfterActivationSuccess = false;
  timeoutAfterSynchronizationSuccess = false;

  async retrieveSubscription(id: string) {
    return this.subscriptions.get(id) ?? null;
  }

  async retrieveCheckoutSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Mock Checkout Session not found.");
    return session;
  }

  async recoverActivation(operationKey: string) {
    const sessionId = this.activationByOperation.get(operationKey);
    return sessionId ? this.sessions.get(sessionId) ?? null : null;
  }

  async createActivationCheckout(proposal: CanonicalStripeOperationProposal) {
    const existingSessionId = this.activationByOperation.get(proposal.operationKey);
    if (existingSessionId) return this.sessions.get(existingSessionId)!;
    this.activationCreates += 1;
    const session: CanonicalStripeCheckoutSession = {
      id: `cs_mock_${this.activationCreates}_${randomUUID()}`,
      status: "open",
      url: `https://mock.invalid/checkout/${this.activationCreates}`,
      externalSubscriptionId: null,
    };
    this.sessions.set(session.id, session);
    this.activationByOperation.set(proposal.operationKey, session.id);
    if (this.timeoutAfterActivationSuccess) {
      this.timeoutAfterActivationSuccess = false;
      throw new Error("mock timeout after Checkout creation");
    }
    return session;
  }

  async expireCheckoutSession(sessionId: string) {
    const session = await this.retrieveCheckoutSession(sessionId);
    const expired = { ...session, status: "expired" as const, url: null };
    this.sessions.set(sessionId, expired);
    return expired;
  }

  async recoverSynchronization(operationKey: string) {
    return this.synchronizationByOperation.get(operationKey) ?? null;
  }

  async synchronizeSubscription(proposal: CanonicalStripeOperationProposal) {
    const prior = this.synchronizationByOperation.get(proposal.operationKey);
    if (prior) return prior;
    this.synchronizationCalls += 1;
    const result = providerResultFromProposal(proposal, proposal.externalSubscriptionId!);
    this.synchronizationByOperation.set(proposal.operationKey, result);
    this.subscriptions.set(result.subscription.externalSubscriptionId, result.subscription);
    if (this.timeoutAfterSynchronizationSuccess) {
      this.timeoutAfterSynchronizationSuccess = false;
      throw new Error("mock timeout after subscription update");
    }
    return result;
  }
}

async function approve(input: {
  subscriptionId: string;
  kind: "activation" | "synchronization";
  observed: ObservedStripeSubscription | null;
}) {
  const proposal = await getCanonicalStripeExecutionProposal(input);
  const operation = await approveCanonicalStripeOperation({
    ...input,
    confirmed: true,
    confirmationToken: proposal.confirmationToken,
    approvedBy: "phase-3b2-test",
    approvalReason: "Synthetic PostgreSQL validation",
  });
  return { proposal, operation };
}

function liveCanaryEnvironment(input: { customerId: string; subscriptionId: string }): CanonicalStripeLiveCanaryEnvironment {
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    CANONICAL_STRIPE_LIVE_CANARY_ENABLED: "true",
    CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID: input.customerId,
    CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID: input.subscriptionId,
    CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID: "acct_phase3b3b_synthetic",
    CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL: "owner@example.com",
    CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET: "phase-3b3b-synthetic-approval-secret-32-bytes",
    STRIPE_SECRET_KEY: "sk_live_synthetic_never_sent",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic_never_sent",
  };
}

async function liveCanaryAuthorization(input: {
  customerId: string;
  subscriptionId: string;
  environment: CanonicalStripeLiveCanaryEnvironment;
}): Promise<CanonicalStripeLiveCanaryAuthorization> {
  const base = asCanonicalStripeLiveCanaryProposal(await getCanonicalStripeExecutionProposal({
    subscriptionId: input.subscriptionId,
    kind: "activation",
    observed: null,
    environment: { NODE_ENV: "test", CANONICAL_STRIPE_EXECUTION_ENABLED: "true" },
  }));
  const issuedAt = new Date();
  const unsigned: Omit<CanonicalStripeLiveCanaryAuthorization, "signature"> = {
    authorizationId: `canary_${randomUUID()}`,
    operation: "activate_subscription",
    operationKey: base.operationKey,
    requestFingerprint: base.requestFingerprint,
    sourceFingerprint: base.sourceFingerprint,
    proposalDigest: canonicalStripeLiveCanaryProposalDigest(base),
    providerContext: LIVE_CANARY_PROVIDER_CONTEXT,
    providerAccountId: input.environment.CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID!,
    externalSubscriptionId: null,
    approvedByEmail: "owner@example.com",
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    currency: "XCD",
    recurringAmount: base.expectedRecurringTotal,
    taxAmount: "0.00",
    totalExpectedCharge: base.expectedRecurringTotal,
    billingIntervalMonths: 1,
    renewalDate: base.nextBillingDate.toISOString().slice(0, 10),
    cancellationProcedure: "cancel_at_period_end_and_verify",
    customerIdentityConfirmed: true,
    subscriptionConfirmed: true,
    chargeConfirmed: true,
    minimumChargeConfirmed: true,
    renewalConfirmed: true,
    cancellationConfirmed: true,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 60 * 60 * 1000).toISOString(),
  };
  return {
    ...unsigned,
    signature: signCanonicalStripeLiveCanaryAuthorization(unsigned, input.environment),
  };
}

test("Phase 3B2: concurrent multi-rate activation creates one reusable mock Checkout", async () => {
  const fixture = await createFixture({ lifecycle: "pending_activation" });
  const { proposal, operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "activation", observed: null });
  assert.equal(proposal.expectedRecurringTotal, "70.00");
  const adapter = new MockCanonicalStripeAdapter();
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    executeCanonicalStripeActivation({ operationId: operation.operationId, adapter })));
  assert.equal(adapter.activationCreates, 1);
  assert.ok(results.every((result) => result.status === "pending"));
  const storedOperation = await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } });
  assert.ok(storedOperation.providerReference);
  assert.ok(results.every((result) =>
    result.providerReference == null || result.providerReference === storedOperation.providerReference));

  const session = adapter.sessions.get(storedOperation.providerReference)!;
  const externalSubscriptionId = `sub_activation_${randomUUID()}`;
  adapter.sessions.set(session.id, { ...session, status: "complete", externalSubscriptionId });
  await handleCanonicalStripeNormalizedWebhook({
    kind: "checkout_completed",
    eventId: `evt_${randomUUID()}`,
    eventCreatedAt: new Date("2026-10-16T12:00:00.000Z"),
    operationKey: operation.operationKey,
    checkoutSessionId: session.id,
    externalSubscriptionId,
  });
  const providerResult = providerResultFromProposal(proposal, externalSubscriptionId);
  await handleCanonicalStripeNormalizedWebhook({
    kind: "subscription_state",
    eventId: `evt_${randomUUID()}`,
    eventCreatedAt: new Date("2026-10-16T12:01:00.000Z"),
    operationKey: operation.operationKey,
    providerResult,
  });
  const persisted = await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } });
  assert.equal(persisted.status, "completed");
  assert.equal(await prisma.subscriptionProviderItem.count({
    where: { subscriptionProviderLink: { customerSubscriptionId: fixture.subscription.id } },
  }), 2);
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).lifecycleStatus, "active");
});

test("Phase 3B3A: stripe_test execution requires its separate opt-in before claiming provider work", async () => {
  const fixture = await createFixture({ lifecycle: "pending_activation" });
  const { operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "activation", observed: null });
  const adapter = new MockCanonicalStripeAdapter("stripe_test");
  await assert.rejects(
    executeCanonicalStripeActivation({
      operationId: operation.operationId,
      adapter,
      environment: {
        NODE_ENV: "test",
        CANONICAL_STRIPE_EXECUTION_ENABLED: "true",
      },
    }),
    /CANONICAL_STRIPE_TEST_PROVIDER_ENABLED=true/,
  );
  assert.equal(adapter.activationCreates, 0);
  const result = await executeCanonicalStripeActivation({
    operationId: operation.operationId,
    adapter,
    environment: {
      NODE_ENV: "test",
      CANONICAL_STRIPE_EXECUTION_ENABLED: "true",
      CANONICAL_STRIPE_TEST_PROVIDER_ENABLED: "true",
    },
  });
  assert.equal(result.status, "pending");
  assert.equal(adapter.activationCreates, 1);
});

test("Phase 3B2: activation timeout after provider success recovers the same Checkout", async () => {
  const fixture = await createFixture({ lifecycle: "pending_activation", items: [{ label: "Annual", amount: "275.00", classification: "negotiated" }], interval: 12 });
  const { operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "activation", observed: null });
  const adapter = new MockCanonicalStripeAdapter();
  adapter.timeoutAfterActivationSuccess = true;
  const timedOut = await executeCanonicalStripeActivation({ operationId: operation.operationId, adapter });
  assert.equal(timedOut.status, "retry_required");
  const recovered = await executeCanonicalStripeActivation({ operationId: operation.operationId, adapter });
  assert.equal(recovered.status, "pending");
  assert.equal(recovered.reusedProviderResult, true);
  assert.equal(adapter.activationCreates, 1);
});

test("Phase 3B2: two same-frequency subscriptions for one customer activate independently", async () => {
  const first = await createFixture({ lifecycle: "pending_activation", items: [{ label: "A", amount: "25.00" }] });
  const second = await createFixture({ customerId: first.customer.id, lifecycle: "pending_activation", items: [{ label: "B", amount: "25.00" }] });
  const firstApproval = await approve({ subscriptionId: first.subscription.id, kind: "activation", observed: null });
  const secondApproval = await approve({ subscriptionId: second.subscription.id, kind: "activation", observed: null });
  assert.notEqual(firstApproval.operation.operationKey, secondApproval.operation.operationKey);
  const adapter = new MockCanonicalStripeAdapter();
  await Promise.all([
    executeCanonicalStripeActivation({ operationId: firstApproval.operation.operationId, adapter }),
    executeCanonicalStripeActivation({ operationId: secondApproval.operation.operationId, adapter }),
  ]);
  assert.equal(adapter.activationCreates, 2);
});

test("Phase 3B2: provider changes after approval block mutation and require review", async () => {
  const fixture = await createFixture({ withProvider: true, observedQuantities: { "XCD:1:25.00": 1 } });
  const { operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "synchronization", observed: fixture.observed });
  const adapter = new MockCanonicalStripeAdapter();
  const changed = {
    ...fixture.observed!,
    items: fixture.observed!.items.map((item) => ({ ...item })),
  };
  changed.items[0].unitAmount = "21.00";
  adapter.subscriptions.set(changed.externalSubscriptionId, changed);
  const result = await executeCanonicalStripeSynchronization({ operationId: operation.operationId, adapter });
  assert.equal(result.status, "manual_review");
  assert.equal(adapter.synchronizationCalls, 0);
  const stored = await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } });
  assert.equal(stored.failureCode, "STALE_PROVIDER_STATE");
});

test("Phase 3B2: quantity changes, new groups and obsolete groups synchronize with one no-proration plan", async () => {
  const fixture = await createFixture({
    withProvider: true,
    observedQuantities: { "XCD:1:25.00": 1 },
    obsoleteProviderGroup: true,
  });
  assert.ok(fixture.observed);
  const missingMapping = fixture.providerLink!.providerItems.find((item) => item.rateGroupFingerprint === "XCD:1:20.00")!;
  await prisma.subscriptionProviderItem.delete({ where: { id: missingMapping.id } });
  fixture.observed.items = fixture.observed.items.filter((item) => item.externalSubscriptionItemId !== missingMapping.externalSubscriptionItemId);
  const { proposal, operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "synchronization", observed: fixture.observed });
  assert.equal(proposal.actions.some((action) => action.kind === "update_quantity"), true);
  assert.equal(proposal.actions.some((action) => action.kind === "create_rate_group"), true);
  assert.equal(proposal.actions.some((action) => action.kind === "retire_rate_group"), true);
  const adapter = new MockCanonicalStripeAdapter();
  adapter.subscriptions.set(fixture.observed.externalSubscriptionId, fixture.observed);
  const result = await executeCanonicalStripeSynchronization({ operationId: operation.operationId, adapter });
  assert.equal(result.status, "reconciled");
  assert.equal(adapter.synchronizationCalls, 1);
  const mappings = await prisma.subscriptionProviderItem.findMany({
    where: { subscriptionProviderLinkId: fixture.providerLink!.id },
    orderBy: { rateGroupFingerprint: "asc" },
  });
  assert.deepEqual(mappings.map((item) => [item.rateGroupFingerprint, item.quantity]), [
    ["XCD:1:20.00", 1],
    ["XCD:1:25.00", 2],
  ]);
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).nextBillingDate?.toISOString().slice(0, 10), "2026-11-01");
});

test("Phase 3B2: local persistence failure recovers provider success without a second mutation", async () => {
  const fixture = await createFixture({ withProvider: true, observedQuantities: { "XCD:1:25.00": 1 } });
  const { operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "synchronization", observed: fixture.observed });
  const adapter = new MockCanonicalStripeAdapter();
  adapter.subscriptions.set(fixture.observed!.externalSubscriptionId, fixture.observed!);
  let fail = true;
  const first = await executeCanonicalStripeSynchronization({
    operationId: operation.operationId,
    adapter,
    beforePersist: async () => {
      if (fail) {
        fail = false;
        throw new Error("synthetic local persistence failure");
      }
    },
  });
  assert.equal(first.status, "retry_required");
  assert.equal((await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } })).failureCode, "LOCAL_PERSISTENCE_FAILED");
  const recovered = await executeCanonicalStripeSynchronization({ operationId: operation.operationId, adapter });
  assert.equal(recovered.status, "reconciled");
  assert.equal(recovered.reusedProviderResult, true);
  assert.equal(adapter.synchronizationCalls, 1);
});

test("Phase 3B2: concurrent synchronization performs one provider mutation", async () => {
  const fixture = await createFixture({ withProvider: true, observedQuantities: { "XCD:1:25.00": 1 } });
  const { operation } = await approve({ subscriptionId: fixture.subscription.id, kind: "synchronization", observed: fixture.observed });
  const adapter = new MockCanonicalStripeAdapter();
  adapter.subscriptions.set(fixture.observed!.externalSubscriptionId, fixture.observed!);
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    executeCanonicalStripeSynchronization({ operationId: operation.operationId, adapter })));
  assert.equal(adapter.synchronizationCalls, 1);
  assert.equal(results.some((result) => result.status === "reconciled"), true);
  assert.equal((await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } })).status, "completed");
});

function paidInvoiceEvent(input: {
  fixture: Awaited<ReturnType<typeof createFixture>>;
  eventCreatedAt?: string;
  eventId?: string;
  externalInvoiceId?: string;
  paymentIntentId?: string;
}): CanonicalStripeInvoiceWebhook {
  const fixture = input.fixture;
  assert.ok(fixture.expected);
  assert.ok(fixture.providerLink);
  const periodStart = new Date(fixture.expected.nextBillingDate);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - fixture.expected.billingIntervalMonths);
  return {
    kind: "invoice_paid",
    eventId: input.eventId ?? `evt_${randomUUID()}`,
    eventCreatedAt: new Date(input.eventCreatedAt ?? "2026-10-16T12:00:00.000Z"),
    externalInvoiceId: input.externalInvoiceId ?? `in_${randomUUID()}`,
    externalSubscriptionId: fixture.providerLink.externalSubscriptionId,
    status: "paid",
    currency: "XCD",
    total: fixture.expected.expectedRecurringTotal,
    amountPaid: fixture.expected.expectedRecurringTotal,
    periodStart,
    periodEnd: fixture.expected.nextBillingDate,
    paymentIntentId: input.paymentIntentId ?? `pi_${randomUUID()}`,
    lines: fixture.providerLink.providerItems
      .filter((mapping) => fixture.expected!.groups.some((group) => group.fingerprint === mapping.rateGroupFingerprint))
      .map((mapping) => {
        const group = fixture.expected!.groups.find((entry) => entry.fingerprint === mapping.rateGroupFingerprint)!;
        return {
          externalInvoiceLineId: `il_${mapping.id}`,
          externalSubscriptionItemId: mapping.externalSubscriptionItemId,
          externalPriceId: mapping.externalPriceId,
          currency: "XCD",
          quantity: group.quantity,
          recurringSubtotal: group.recurringTotal,
        };
      }),
  };
}

test("Phase 3B2: paid invoice replay creates one invoice, payment and immutable service attribution", async () => {
  const fixture = await createFixture({ withProvider: true });
  const event = paidInvoiceEvent({ fixture });
  const first = await handleCanonicalStripeNormalizedWebhook(event);
  const replay = await handleCanonicalStripeNormalizedWebhook(event);
  assert.equal(first.reconciliation, "reconciled");
  assert.equal(replay.reconciliation, "reconciled");
  const billing = await prisma.billingInvoice.findUniqueOrThrow({
    where: { provider_externalInvoiceId: { provider: "stripe", externalInvoiceId: event.externalInvoiceId } },
    include: { nativeMirror: { include: { payments: true, serviceSnapshots: true } } },
  });
  assert.ok(billing.nativeMirror);
  assert.equal(billing.nativeMirror.payments.length, 1);
  assert.equal(billing.nativeMirror.serviceSnapshots.length, 3);
  assert.equal(await prisma.payment.count({ where: { stripePaymentIntentId: event.paymentIntentId } }), 1);
  assert.equal((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).nextBillingDate?.toISOString().slice(0, 10), "2026-12-01");
});

test("Phase 3B2: older or failed events cannot downgrade an already paid canonical invoice", async () => {
  const fixture = await createFixture({ withProvider: true });
  const paid = paidInvoiceEvent({ fixture, eventCreatedAt: "2026-10-16T12:00:00.000Z" });
  await handleCanonicalStripeNormalizedWebhook(paid);
  const olderFailure: CanonicalStripeInvoiceWebhook = {
    ...paid,
    kind: "invoice_payment_failed",
    eventId: `evt_${randomUUID()}`,
    eventCreatedAt: new Date("2026-10-16T11:59:00.000Z"),
    status: "open",
    amountPaid: "0.00",
    paymentIntentId: null,
  };
  const result = await handleCanonicalStripeNormalizedWebhook(olderFailure);
  assert.equal(result.stale, true);
  const billing = await prisma.billingInvoice.findUniqueOrThrow({
    where: { provider_externalInvoiceId: { provider: "stripe", externalInvoiceId: paid.externalInvoiceId } },
  });
  assert.equal(billing.status, "paid");
});

test("Phase 3B2: allocation limitations create a reconciliation issue without invented snapshots", async () => {
  const fixture = await createFixture({ withProvider: true });
  const event = paidInvoiceEvent({ fixture });
  event.lines[0].discountAmount = "1.00";
  const result = await handleCanonicalStripeNormalizedWebhook(event);
  assert.equal(result.reconciliation, "manual_review");
  const billing = await prisma.billingInvoice.findUniqueOrThrow({
    where: { provider_externalInvoiceId: { provider: "stripe", externalInvoiceId: event.externalInvoiceId } },
    include: { nativeMirror: true },
  });
  assert.equal(billing.nativeMirror, null);
  assert.equal(await prisma.operationalEvent.count({
    where: { customerId: fixture.customer.id, category: "billing.reconciliation_required" },
  }), 1);
});

test("Phase 3B2: failed payment marks collection attention without suspending tracking services", async () => {
  const fixture = await createFixture({ withProvider: true });
  const failed: CanonicalStripeInvoiceWebhook = {
    ...paidInvoiceEvent({ fixture }),
    kind: "invoice_payment_failed",
    status: "open",
    amountPaid: "0.00",
    paymentIntentId: null,
  };
  const result = await handleCanonicalStripeNormalizedWebhook(failed);
  assert.equal(result.reconciliation, "reconciled");
  const subscription = await prisma.customerSubscription.findUniqueOrThrow({
    where: { id: fixture.subscription.id },
    include: { items: true },
  });
  assert.equal(subscription.collectionHealth, "past_due");
  assert.equal(subscription.lifecycleStatus, "active");
  assert.ok(subscription.items.every((item) => item.status === "active"));
});

test("Phase 3B2: annual mid-cycle adjustment is not duplicated by the current recurring invoice", async () => {
  const fixture = await createFixture({
    withProvider: true,
    interval: 12,
    nextBillingDate: "2027-01-01",
    items: [
      { label: "Baseline annual", amount: "275.00", billingFrom: "2026-01-01" },
      { label: "Added annual", amount: "275.00", billingFrom: "2027-01-01" },
    ],
  });
  const added = await prisma.subscriptionItem.findFirstOrThrow({
    where: { customerSubscriptionId: fixture.subscription.id, label: "Added annual" },
    include: { rates: true },
  });
  const adjustment = await prisma.invoice.create({
    data: {
      customerId: fixture.customer.id,
      customerSubscriptionId: fixture.subscription.id,
      kind: "annual_adjustment",
      status: "paid",
      currency: "XCD",
      subtotal: "100.00",
      total: "100.00",
      amountPaid: "100.00",
      amountDue: "0.00",
      adjustmentGenerationKey: `annual-proration:${added.id}:2026-01-01:2027-01-01`,
      serviceSnapshots: {
        create: {
          subscriptionItemId: added.id,
          subscriptionItemRateId: added.rates[0].id,
          serviceLabelSnapshot: added.label,
          agreedAmountPerCycleSnapshot: "275.00",
          billedAmount: "100.00",
          currency: "XCD",
          servicePeriodStart: new Date("2026-08-21T00:00:00.000Z"),
          servicePeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
        },
      },
    },
  });
  assert.ok(adjustment.id);
  const currentExpected = buildCanonicalStripeRateGroups(
    await prisma.customerSubscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
      include: { items: { include: { rates: true } } },
    }),
    new Date("2026-01-01T00:00:00.000Z"),
    { requireActive: false },
  );
  assert.equal(currentExpected.expectedRecurringTotal.toFixed(2), "275.00");
  const event = paidInvoiceEvent({ fixture });
  event.total = "275.00";
  event.amountPaid = "275.00";
  event.lines = event.lines.filter((line) => {
    const mapping = fixture.providerLink!.providerItems.find((item) => item.externalSubscriptionItemId === line.externalSubscriptionItemId)!;
    return mapping.rateGroupFingerprint === "XCD:12:275.00";
  });
  event.lines[0].quantity = 1;
  event.lines[0].recurringSubtotal = "275.00";
  const result = await handleCanonicalStripeNormalizedWebhook(event);
  assert.equal(result.reconciliation, "reconciled");
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { subscriptionItemId: added.id } }), 1);
});

test("Phase 3B2: legacy, shadow and production safeguards prevent canonical execution", async () => {
  for (const controlMode of ["legacy", "shadow"] as const) {
    const fixture = await createFixture({ lifecycle: "pending_activation", controlMode });
    await assert.rejects(
      getCanonicalStripeExecutionProposal({ subscriptionId: fixture.subscription.id, kind: "activation", observed: null }),
      (caught: unknown) => caught instanceof Error,
    );
  }
  const canonical = await createFixture({ lifecycle: "pending_activation" });
  await assert.rejects(
    getCanonicalStripeExecutionProposal({
      subscriptionId: canonical.subscription.id,
      kind: "activation",
      observed: null,
      environment: { NODE_ENV: "production", CANONICAL_STRIPE_EXECUTION_ENABLED: "true" },
    }),
    /disabled in production/,
  );
});

test("Phase 3B3B: a live adapter cannot execute a general or unsigned production operation", async () => {
  const fixture = await createFixture({
    lifecycle: "pending_activation",
    items: [{ label: "Canary service", amount: "5.00", classification: "negotiated" }],
  });
  const { operation } = await approve({
    subscriptionId: fixture.subscription.id,
    kind: "activation",
    observed: null,
  });
  const environment = liveCanaryEnvironment({
    customerId: fixture.customer.id,
    subscriptionId: fixture.subscription.id,
  });
  const adapter = new MockCanonicalStripeAdapter("stripe_live_canary", "unapproved_authorization");
  await assert.rejects(
    executeCanonicalStripeActivation({ operationId: operation.operationId, adapter, environment }),
    /durable Phase 3B3B owner authorization/,
  );
  assert.equal(adapter.activationCreates, 0);
});

test("Phase 3B3B: one approved EC$5 subscription executes once and reconciles live webhooks without legacy spillover", async () => {
  const fixture = await createFixture({
    lifecycle: "pending_activation",
    items: [{ label: "Approved canary service", amount: "5.00", classification: "negotiated" }],
  });
  const environment = liveCanaryEnvironment({
    customerId: fixture.customer.id,
    subscriptionId: fixture.subscription.id,
  });
  const authorization = await liveCanaryAuthorization({
    customerId: fixture.customer.id,
    subscriptionId: fixture.subscription.id,
    environment,
  });
  const proposal = await getCanonicalStripeExecutionProposal({
    subscriptionId: fixture.subscription.id,
    kind: "activation",
    observed: null,
    environment,
    liveCanaryAuthorization: authorization,
  });
  assert.equal(proposal.expectedRecurringTotal, "5.00");
  assert.equal(proposal.billingIntervalMonths, 1);
  assert.match(proposal.operationKey, /^canonical-stripe-live-canary:/);
  const operation = await approveCanonicalStripeOperation({
    subscriptionId: fixture.subscription.id,
    kind: "activation",
    observed: null,
    confirmed: true,
    confirmationToken: proposal.confirmationToken,
    approvedBy: authorization.approvedByEmail,
    approvalReason: "Owner-approved synthetic PostgreSQL canary validation",
    environment,
    liveCanaryAuthorization: authorization,
  });

  const other = await createFixture({
    customerId: fixture.customer.id,
    lifecycle: "pending_activation",
    items: [{ label: "Not approved", amount: "5.00", classification: "negotiated" }],
  });
  const otherEnvironment = { ...environment, CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID: other.subscription.id };
  const otherAuthorization = await liveCanaryAuthorization({
    customerId: fixture.customer.id,
    subscriptionId: other.subscription.id,
    environment: otherEnvironment,
  });
  const otherProposal = await getCanonicalStripeExecutionProposal({
    subscriptionId: other.subscription.id,
    kind: "activation",
    observed: null,
    environment: otherEnvironment,
    liveCanaryAuthorization: otherAuthorization,
  });
  await assert.rejects(
    approveCanonicalStripeOperation({
      subscriptionId: other.subscription.id,
      kind: "activation",
      observed: null,
      confirmed: true,
      confirmationToken: otherProposal.confirmationToken,
      approvedBy: otherAuthorization.approvedByEmail,
      approvalReason: "Must be blocked by single-subscription isolation",
      environment: otherEnvironment,
      liveCanaryAuthorization: otherAuthorization,
    }),
    /single-subscription live canary already has a different durable operation/,
  );

  const adapter = new MockCanonicalStripeAdapter("stripe_live_canary", authorization.authorizationId);
  const executions = await Promise.all(Array.from({ length: 6 }, () => executeCanonicalStripeActivation({
    operationId: operation.operationId,
    adapter,
    environment,
  })));
  assert.equal(adapter.activationCreates, 1);
  assert.ok(executions.every((result) => result.status === "pending"));
  const stored = await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } });
  const externalSubscriptionId = `sub_canary_${randomUUID()}`;
  adapter.sessions.set(stored.providerReference!, {
    ...adapter.sessions.get(stored.providerReference!)!,
    status: "complete",
    externalSubscriptionId,
  });

  const checkoutEvent = {
    id: `evt_canary_checkout_${randomUUID()}`,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: stored.providerReference,
        object: "checkout.session",
        livemode: true,
        status: "complete",
        subscription: externalSubscriptionId,
        metadata: {
          tl_canonical_operation_key: operation.operationKey,
          tl_canonical_subscription_id: fixture.subscription.id,
          tl_provider_mode: "live_canary",
          tl_canary_authorization_id: authorization.authorizationId,
        },
      },
    },
    livemode: true,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  } as unknown as Stripe.Event;
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(checkoutEvent, environment), true);

  const providerResult = providerResultFromProposal(proposal, externalSubscriptionId);
  const subscriptionEvent = {
    id: `evt_canary_subscription_${randomUUID()}`,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: externalSubscriptionId,
        object: "subscription",
        livemode: true,
        status: "active",
        current_period_start: Math.floor(providerResult.subscription.currentPeriodStart!.getTime() / 1000),
        current_period_end: Math.floor(providerResult.subscription.currentPeriodEnd!.getTime() / 1000),
        cancel_at_period_end: false,
        metadata: {
          tl_canonical_operation_key: operation.operationKey,
          tl_canonical_subscription_id: fixture.subscription.id,
          tl_provider_mode: "live_canary",
          tl_canary_authorization_id: authorization.authorizationId,
        },
        items: {
          object: "list",
          has_more: false,
          url: `/v1/subscription_items?subscription=${externalSubscriptionId}`,
          data: providerResult.rateGroups.map((group) => ({
            id: group.externalSubscriptionItemId,
            object: "subscription_item",
            quantity: group.quantity,
            price: {
              id: group.externalPriceId,
              object: "price",
              livemode: true,
              active: true,
              type: "recurring",
              currency: group.currency.toLowerCase(),
              unit_amount: Number(group.agreedAmountPerCycle) * 100,
              unit_amount_decimal: String(Number(group.agreedAmountPerCycle) * 100),
              recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
              metadata: { tl_rate_group_fingerprint: group.fingerprint },
            },
          })),
        },
      },
    },
    livemode: true,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.created",
  } as unknown as Stripe.Event;
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(subscriptionEvent, environment), true);
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(subscriptionEvent, environment), true);
  assert.equal((await prisma.billingOperation.findUniqueOrThrow({ where: { id: operation.operationId } })).status, "completed");

  const paidEvent = {
    id: `evt_canary_invoice_${randomUUID()}`,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `in_canary_${randomUUID()}`,
        object: "invoice",
        livemode: true,
        status: "paid",
        currency: "xcd",
        total: 500,
        amount_due: 500,
        amount_paid: 500,
        subscription: externalSubscriptionId,
        payment_intent: `pi_canary_${randomUUID()}`,
        lines: {
          object: "list",
          has_more: false,
          url: "/v1/invoices/canary/lines",
          data: providerResult.rateGroups.map((group) => ({
            id: `il_${group.externalSubscriptionItemId}`,
            object: "line_item",
            amount: 500,
            currency: "xcd",
            quantity: group.quantity,
            subscription_item: group.externalSubscriptionItemId,
            price: { id: group.externalPriceId },
            period: {
              start: Math.floor(providerResult.subscription.currentPeriodStart!.getTime() / 1000),
              end: Math.floor(providerResult.subscription.currentPeriodEnd!.getTime() / 1000),
            },
            discount_amounts: [],
            tax_amounts: [],
          })),
        },
      },
    },
    livemode: true,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "invoice.paid",
  } as unknown as Stripe.Event;
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(paidEvent, environment), true);
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(paidEvent, environment), true);
  const paidInvoiceId = (paidEvent.data.object as Stripe.Invoice).id;
  assert.equal(await prisma.billingInvoice.count({ where: { externalInvoiceId: paidInvoiceId } }), 1);
  assert.equal(await prisma.payment.count({ where: { stripePaymentIntentId: (paidEvent.data.object as Stripe.Invoice).payment_intent as string } }), 1);

  const failedEvent = structuredClone(paidEvent) as Stripe.Event;
  failedEvent.id = `evt_canary_failed_${randomUUID()}`;
  failedEvent.type = "invoice.payment_failed";
  const failedInvoice = failedEvent.data.object as Stripe.Invoice;
  failedInvoice.id = `in_canary_failed_${randomUUID()}`;
  failedInvoice.status = "open";
  failedInvoice.amount_paid = 0;
  failedInvoice.payment_intent = null;
  failedEvent.created += 60;
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(failedEvent, environment), true);
  const afterFailure = await prisma.customerSubscription.findUniqueOrThrow({
    where: { id: fixture.subscription.id },
    include: { items: true },
  });
  assert.equal(afterFailure.collectionHealth, "past_due");
  assert.equal(afterFailure.lifecycleStatus, "active");
  assert.ok(afterFailure.items.every((item) => item.status === "active"));

  const strippedCanaryEvent = {
    ...checkoutEvent,
    id: `evt_canary_stripped_${randomUUID()}`,
    data: { object: { ...(checkoutEvent.data.object as object), metadata: { tl_customer_id: fixture.customer.id } } },
  } as unknown as Stripe.Event;
  await assert.rejects(
    tryHandleCanonicalStripeLiveCanaryWebhookEvent(strippedCanaryEvent, environment),
    /lacks required period or item evidence/,
  );

  const legacyEvent = structuredClone(strippedCanaryEvent) as Stripe.Event;
  legacyEvent.id = `evt_legacy_${randomUUID()}`;
  (legacyEvent.data.object as Stripe.Checkout.Session).subscription = `sub_legacy_${randomUUID()}`;
  assert.equal(await tryHandleCanonicalStripeLiveCanaryWebhookEvent(legacyEvent, environment), false);
});
