import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/db";
import {
  buildCanonicalStripeRateGroups,
  CanonicalStripeShadowError,
  type ObservedStripeSubscription,
} from "../../lib/domain/canonical-stripe-shadow";
import {
  getCanonicalStripeInvoiceAttributionPreview,
  getCanonicalStripeShadowReadModel,
} from "../../lib/services/canonical-stripe-shadow-service";

const originalFeatureFlag = process.env.CANONICAL_STRIPE_SHADOW_ENABLED;
process.env.CANONICAL_STRIPE_SHADOW_ENABLED = "true";

after(async () => {
  if (originalFeatureFlag == null) delete process.env.CANONICAL_STRIPE_SHADOW_ENABLED;
  else process.env.CANONICAL_STRIPE_SHADOW_ENABLED = originalFeatureFlag;
  await prisma.$disconnect();
});

type StripeFixture = Awaited<ReturnType<typeof createStripeFixture>>;

async function createStripeFixture(input: {
  customerId?: string;
  controlMode?: "legacy" | "shadow" | "canonical";
  interval?: 1 | 3 | 6 | 12;
  amounts?: { label: string; amount: string; classification?: "standard" | "negotiated" }[];
  createProviderLink?: boolean;
  blankPriceForFirstGroup?: boolean;
} = {}) {
  const customer = input.customerId
    ? await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } })
    : await prisma.customer.create({ data: { company: `Phase 3B1 ${randomUUID()}` } });
  const interval = input.interval ?? 1;
  const nextBillingDate = new Date(interval === 12 ? "2027-01-01T00:00:00.000Z" : "2026-11-01T00:00:00.000Z");
  const subscription = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      name: `Stripe shadow ${randomUUID()}`,
      collectionMethod: "stripe_autocharge",
      lifecycleStatus: "active",
      collectionHealth: "not_started",
      billingIntervalMonths: interval,
      currency: "XCD",
      agreedAmountPerCycle: "0.00",
      commercialStartDate: new Date("2026-01-01T00:00:00.000Z"),
      billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
      nextBillingDate,
      controlMode: input.controlMode ?? "shadow",
      status: "active",
      planTermMonths: interval,
    },
  });
  for (const entry of input.amounts ?? [
    { label: "Standard A", amount: "25.00" },
    { label: "Standard B", amount: "25.00" },
    { label: "Negotiated C", amount: "20.00", classification: "negotiated" as const },
  ]) {
    await prisma.subscriptionItem.create({
      data: {
        customerSubscriptionId: subscription.id,
        label: entry.label,
        status: "active",
        serviceActivatedDate: new Date("2026-01-01T00:00:00.000Z"),
        billingEffectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        rates: {
          create: {
            billingIntervalMonths: interval,
            agreedAmountPerCycle: entry.amount,
            currency: "XCD",
            effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
            classification: entry.classification ?? "standard",
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
  let providerLink = null;
  if (input.createProviderLink !== false && expected) {
    providerLink = await prisma.subscriptionProviderLink.create({
      data: {
        customerSubscriptionId: subscription.id,
        provider: "stripe",
        externalSubscriptionId: `sub_${randomUUID()}`,
        providerStatus: "active",
        activatedAt: new Date("2026-01-01T00:00:00.000Z"),
        providerItems: {
          create: expected.groups.map((group, index) => ({
            externalSubscriptionItemId: `si_${randomUUID()}`,
            externalPriceId: input.blankPriceForFirstGroup && index === 0 ? "" : `price_${randomUUID()}`,
            currency: group.currency,
            billingIntervalMonths: group.billingIntervalMonths,
            agreedAmountPerCycle: group.agreedAmountPerCycle,
            quantity: group.quantity,
            rateGroupFingerprint: group.fingerprint,
          })),
        },
      },
      include: { providerItems: { orderBy: { rateGroupFingerprint: "asc" } } },
    });
  }
  return { customer, subscription, expected, providerLink };
}

function observedFor(fixture: StripeFixture): ObservedStripeSubscription {
  assert.ok(fixture.expected);
  assert.ok(fixture.providerLink);
  const months = fixture.expected.billingIntervalMonths;
  const periodEnd = fixture.expected.nextBillingDate;
  const periodStart = new Date(periodEnd);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - months);
  return {
    externalSubscriptionId: fixture.providerLink.externalSubscriptionId,
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    items: fixture.providerLink.providerItems.map((item) => ({
      externalSubscriptionItemId: item.externalSubscriptionItemId,
      externalPriceId: item.externalPriceId,
      currency: item.currency,
      billingIntervalMonths: item.billingIntervalMonths,
      unitAmount: item.agreedAmountPerCycle,
      quantity: item.quantity,
    })),
  };
}

test("Phase 3B1: PostgreSQL-backed EC$70 groups reconcile without writes or BillingOperations", async () => {
  const fixture = await createStripeFixture();
  const operationsBefore = await prisma.billingOperation.count();
  const linksBefore = await prisma.subscriptionProviderLink.count({ where: { customerSubscriptionId: fixture.subscription.id } });
  const result = await getCanonicalStripeShadowReadModel({
    subscriptionId: fixture.subscription.id,
    observed: observedFor(fixture),
  });
  assert.equal(result.expectedRecurringTotal, "70.00");
  assert.deepEqual(result.rateGroups.map((group) => [group.agreedAmountPerCycle, group.quantity]), [
    ["20.00", 1],
    ["25.00", 2],
  ]);
  assert.equal(result.reconciliation.status, "matched");
  assert.equal(result.operationPreview.actions.length, 0);
  assert.equal(result.operationPreview.executable, false);
  assert.equal(await prisma.billingOperation.count(), operationsBefore);
  assert.equal(await prisma.subscriptionProviderLink.count({ where: { customerSubscriptionId: fixture.subscription.id } }), linksBefore);
});

test("Phase 3B1: same-customer and same-frequency subscriptions retain separate provider ownership", async () => {
  const first = await createStripeFixture({ amounts: [{ label: "A", amount: "25.00" }] });
  const second = await createStripeFixture({
    customerId: first.customer.id,
    amounts: [{ label: "B", amount: "25.00" }],
  });
  const firstResult = await getCanonicalStripeShadowReadModel({
    subscriptionId: first.subscription.id,
    observed: observedFor(first),
  });
  const secondResult = await getCanonicalStripeShadowReadModel({
    subscriptionId: second.subscription.id,
    observed: observedFor(second),
  });
  assert.notEqual(firstResult.subscriptionId, secondResult.subscriptionId);
  assert.notEqual(firstResult.provider.externalSubscriptionId, secondResult.provider.externalSubscriptionId);
  assert.equal(firstResult.reconciliation.status, "matched");
  assert.equal(secondResult.reconciliation.status, "matched");
});

test("Phase 3B1: provider ownership conflicts are explicit and never inferred from the customer", async () => {
  const first = await createStripeFixture({ amounts: [{ label: "A", amount: "25.00" }] });
  const second = await createStripeFixture({ customerId: first.customer.id, amounts: [{ label: "B", amount: "25.00" }] });
  const result = await getCanonicalStripeShadowReadModel({
    subscriptionId: first.subscription.id,
    observed: observedFor(second),
  });
  assert.equal(result.reconciliation.status, "ownership_conflict");
  assert.equal(result.reconciliation.issues.some((entry) => entry.code === "subscription_ownership_conflict"), true);
  assert.equal(result.reconciliation.issues.some((entry) => entry.code === "provider_subscription_mismatch"), true);
  assert.equal(result.operationPreview.executable, false);
});

test("Phase 3B1: missing provider Price evidence blocks future operation planning", async () => {
  const fixture = await createStripeFixture({ blankPriceForFirstGroup: true });
  const result = await getCanonicalStripeShadowReadModel({
    subscriptionId: fixture.subscription.id,
    observed: observedFor(fixture),
  });
  assert.equal(result.reconciliation.status, "insufficient_evidence");
  assert.equal(result.reconciliation.issues.some((entry) => entry.code === "missing_price_reference"), true);
  assert.equal(result.operationPreview.blockers.some((entry) => entry.code === "missing_price_reference"), true);
  assert.equal(result.operationPreview.createsBillingOperation, false);
});

test("Phase 3B1: historical provider links remain visible and are not overwritten", async () => {
  const fixture = await createStripeFixture({ createProviderLink: false });
  await prisma.subscriptionProviderLink.create({
    data: {
      customerSubscriptionId: fixture.subscription.id,
      provider: "stripe",
      externalSubscriptionId: `sub_historical_${randomUUID()}`,
      providerStatus: "canceled",
      activatedAt: new Date("2025-01-01T00:00:00.000Z"),
      endedAt: new Date("2025-12-31T00:00:00.000Z"),
    },
  });
  const current = await prisma.subscriptionProviderLink.create({
    data: {
      customerSubscriptionId: fixture.subscription.id,
      provider: "stripe",
      externalSubscriptionId: `sub_current_${randomUUID()}`,
      providerStatus: "active",
    },
  });
  const result = await getCanonicalStripeShadowReadModel({ subscriptionId: fixture.subscription.id, observed: null });
  assert.equal(result.provider.activeLinkId, current.id);
  assert.equal(result.provider.historicalLinks.length, 1);
  assert.ok(result.provider.historicalLinks[0].endedAt);
  assert.equal(result.reconciliation.status, "insufficient_evidence");
});

test("Phase 3B1: grouped provider invoice attribution is deterministic, replay-safe, and read-only", async () => {
  const fixture = await createStripeFixture();
  assert.ok(fixture.expected);
  assert.ok(fixture.providerLink);
  const billingInvoice = await prisma.billingInvoice.create({
    data: {
      customerId: fixture.customer.id,
      customerSubscriptionId: fixture.subscription.id,
      subscriptionProviderLinkId: fixture.providerLink.id,
      provider: "stripe",
      externalInvoiceId: `in_${randomUUID()}`,
      kind: "subscription",
      status: "paid",
      amountXcd: fixture.expected.expectedRecurringTotal,
      currency: "XCD",
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-01T00:00:00.000Z"),
      stripeSubscriptionId: fixture.providerLink.externalSubscriptionId,
    },
  });
  const lines = fixture.providerLink.providerItems.map((mapping) => {
    const group = fixture.expected!.groups.find((entry) => entry.fingerprint === mapping.rateGroupFingerprint)!;
    return {
      externalInvoiceLineId: `il_${mapping.id}`,
      externalSubscriptionItemId: mapping.externalSubscriptionItemId,
      externalPriceId: mapping.externalPriceId,
      currency: "XCD",
      quantity: group.quantity,
      recurringSubtotal: group.recurringTotal,
    };
  });
  const snapshotsBefore = await prisma.invoiceServiceSnapshot.count();
  const first = await getCanonicalStripeInvoiceAttributionPreview({
    billingInvoiceId: billingInvoice.id,
    externalSubscriptionId: fixture.providerLink.externalSubscriptionId,
    lines,
  });
  const replay = await getCanonicalStripeInvoiceAttributionPreview({
    billingInvoiceId: billingInvoice.id,
    externalSubscriptionId: fixture.providerLink.externalSubscriptionId,
    lines: [...lines].reverse(),
  });
  assert.equal(first.status, "complete");
  assert.equal(first.snapshots.length, 3);
  assert.deepEqual(first, replay);
  assert.equal(await prisma.invoiceServiceSnapshot.count(), snapshotsBefore);
});

test("Phase 3B1: existing database uniqueness rejects duplicate provider invoices and Stripe payments", async () => {
  const fixture = await createStripeFixture({ amounts: [{ label: "A", amount: "25.00" }] });
  const externalInvoiceId = `in_replay_${randomUUID()}`;
  await prisma.billingInvoice.create({
    data: {
      customerId: fixture.customer.id,
      provider: "stripe",
      externalInvoiceId,
      status: "paid",
      amountXcd: "25.00",
      currency: "XCD",
    },
  });
  await assert.rejects(
    prisma.billingInvoice.create({
      data: {
        customerId: fixture.customer.id,
        provider: "stripe",
        externalInvoiceId,
        status: "paid",
        amountXcd: "25.00",
        currency: "XCD",
      },
    }),
    (caught: unknown) => caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002",
  );

  const invoice = await prisma.invoice.create({
    data: {
      customerId: fixture.customer.id,
      currency: "XCD",
      subtotal: "25.00",
      total: "25.00",
      amountPaid: "0.00",
      amountDue: "25.00",
    },
  });
  const paymentIntentId = `pi_replay_${randomUUID()}`;
  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      customerId: fixture.customer.id,
      amount: "25.00",
      currency: "XCD",
      method: "stripe",
      stripePaymentIntentId: paymentIntentId,
    },
  });
  await assert.rejects(
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        customerId: fixture.customer.id,
        amount: "25.00",
        currency: "XCD",
        method: "stripe",
        stripePaymentIntentId: paymentIntentId,
      },
    }),
    (caught: unknown) => caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002",
  );
});

test("Phase 3B1: legacy subscriptions remain isolated from canonical provider services", async () => {
  const fixture = await createStripeFixture({ controlMode: "legacy", createProviderLink: false });
  await assert.rejects(
    getCanonicalStripeShadowReadModel({ subscriptionId: fixture.subscription.id, observed: null }),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError
      && caught.code === "LEGACY_SUBSCRIPTION_PROTECTED",
  );
});

test("Phase 3B1: production hard-disable cannot be bypassed by the feature flag", async () => {
  const fixture = await createStripeFixture({ amounts: [{ label: "A", amount: "25.00" }] });
  await assert.rejects(
    getCanonicalStripeShadowReadModel({
      subscriptionId: fixture.subscription.id,
      observed: observedFor(fixture),
      environment: {
        NODE_ENV: "production",
        CANONICAL_STRIPE_SHADOW_ENABLED: "true",
      },
    }),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError
      && caught.code === "PRODUCTION_SHADOW_DISABLED",
  );
  await assert.rejects(
    getCanonicalStripeShadowReadModel({
      subscriptionId: fixture.subscription.id,
      observed: observedFor(fixture),
      environment: {
        NODE_ENV: "test",
        VERCEL_ENV: "production",
        CANONICAL_STRIPE_SHADOW_ENABLED: "true",
      },
    }),
    (caught: unknown) => caught instanceof CanonicalStripeShadowError
      && caught.code === "PRODUCTION_SHADOW_DISABLED",
  );
});
