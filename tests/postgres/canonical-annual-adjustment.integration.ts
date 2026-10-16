import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "../../lib/db";
import { CanonicalAnnualAdjustmentError } from "../../lib/domain/canonical-annual-adjustment";
import {
  createAnnualServiceAdjustmentInvoice,
  getAnnualServiceAdjustmentProposal,
} from "../../lib/services/canonical-annual-adjustment-service";
import {
  getCanonicalSubscriptionBillingSummary,
  previewCanonicalSubscriptionCycle,
} from "../../lib/services/canonical-native-billing-service";
import { recordInvoicePayment } from "../../lib/services/native-invoice-service";
import { recordNativeInvoiceStripeCheckout } from "../../lib/services/native-invoice-stripe-payment-service";

const originalFlag = process.env.CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED;
process.env.CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED = "true";

after(async () => {
  if (originalFlag == null) delete process.env.CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED;
  else process.env.CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED = originalFlag;
  await prisma.$disconnect();
});

type FixtureOptions = {
  activationDate?: string;
  anchorDate?: string;
  nextBillingDate?: string;
  annualAmount?: string;
  collectionMethod?: "manual_invoice" | "stripe_autocharge";
  controlMode?: "legacy" | "shadow" | "canonical";
  lifecycleStatus?: "draft" | "pending_activation" | "active" | "paused" | "canceled" | "ended";
  includeBaselineItem?: boolean;
  createAssignment?: boolean;
};

async function createFixture(options: FixtureOptions = {}) {
  const anchorDate = options.anchorDate ?? "2026-01-01";
  const nextBillingDate = options.nextBillingDate ?? "2027-01-01";
  const activationDate = options.activationDate ?? "2026-04-01";
  const annualAmount = options.annualAmount ?? "275.00";
  const collectionMethod = options.collectionMethod ?? "manual_invoice";
  const user = await prisma.user.create({
    data: {
      email: `phase3p-${randomUUID()}@example.test`,
      passwordHash: "test-only",
    },
  });
  const customer = await prisma.customer.create({
    data: { company: `Phase 3P ${randomUUID()}`, email: "sanitized@example.test" },
  });
  const subscription = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id,
      name: `Annual ${randomUUID()}`,
      collectionMethod,
      lifecycleStatus: options.lifecycleStatus ?? "active",
      collectionHealth: "not_started",
      billingIntervalMonths: 12,
      currency: "XCD",
      agreedAmountPerCycle: annualAmount,
      commercialStartDate: new Date(`${anchorDate}T00:00:00.000Z`),
      billingAnchorDate: new Date(`${anchorDate}T00:00:00.000Z`),
      nextBillingDate: new Date(`${nextBillingDate}T00:00:00.000Z`),
      gracePeriodDays: 7,
      controlMode: options.controlMode ?? "canonical",
      status: "active",
      planTermMonths: 12,
      stripeSubscriptionId: collectionMethod === "stripe_autocharge" ? `sub_${randomUUID()}` : null,
      stripeCustomerId: collectionMethod === "stripe_autocharge" ? `cus_${randomUUID()}` : null,
    },
  });
  if (options.includeBaselineItem) {
    await prisma.subscriptionItem.create({
      data: {
        customerSubscriptionId: subscription.id,
        label: "Existing annual service",
        status: "active",
        serviceActivatedDate: new Date(`${anchorDate}T00:00:00.000Z`),
        billingEffectiveFrom: new Date(`${anchorDate}T00:00:00.000Z`),
        rates: {
          create: {
            billingIntervalMonths: 12,
            agreedAmountPerCycle: "275.00",
            currency: "XCD",
            effectiveFrom: new Date(`${anchorDate}T00:00:00.000Z`),
          },
        },
      },
    });
  }
  const item = await prisma.subscriptionItem.create({
    data: {
      customerSubscriptionId: subscription.id,
      label: "Added annual tracking service",
      status: "active",
      serviceActivatedDate: new Date(`${activationDate}T00:00:00.000Z`),
      billingEffectiveFrom: new Date(`${nextBillingDate}T00:00:00.000Z`),
      rates: {
        create: {
          billingIntervalMonths: 12,
          agreedAmountPerCycle: annualAmount,
          currency: "XCD",
          effectiveFrom: new Date(`${activationDate}T00:00:00.000Z`),
          classification: annualAmount === "275.00" ? "standard" : "negotiated",
        },
      },
    },
    include: { rates: true },
  });
  const schedule = collectionMethod === "manual_invoice"
    ? await prisma.recurringInvoiceSchedule.create({
        data: {
          customerId: customer.id,
          customerSubscriptionId: subscription.id,
          name: "Annual manual schedule",
          currency: "XCD",
          intervalMonths: 12,
          nextIssueDate: new Date(`${nextBillingDate}T00:00:00.000Z`),
          dueDaysAfterIssue: 0,
          autoEmail: false,
          paymentInstructions: "Test cheque instructions",
        },
      })
    : null;
  const providerLink = collectionMethod === "stripe_autocharge"
    ? await prisma.subscriptionProviderLink.create({
        data: {
          customerSubscriptionId: subscription.id,
          provider: "stripe",
          externalSubscriptionId: subscription.stripeSubscriptionId!,
          providerStatus: "active",
        },
      })
    : null;

  let assignment = null;
  if (options.createAssignment) {
    const model = await prisma.deviceModel.create({
      data: { name: `Phase 3P ${randomUUID()}`, retailPrice: "100.00" },
    });
    const device = await prisma.device.create({
      data: {
        imei: randomUUID().replaceAll("-", "").slice(0, 15),
        deviceModelId: model.id,
        status: "assigned",
      },
    });
    assignment = await prisma.serviceAssignment.create({
      data: {
        customerId: customer.id,
        deviceId: device.id,
        subscriptionItemId: item.id,
        status: "active",
        startDate: new Date(`${activationDate}T00:00:00.000Z`),
        intervalMonths: 12,
        nextDueDate: new Date(`${nextBillingDate}T00:00:00.000Z`),
      },
    });
  }
  return { user, customer, subscription, item, schedule, providerLink, assignment };
}

async function executeFromPreview(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<Parameters<typeof createAnnualServiceAdjustmentInvoice>[0]> = {},
) {
  const proposal = await getAnnualServiceAdjustmentProposal(fixture.item.id);
  const result = await createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: fixture.item.id,
    generationKey: proposal.generationKey,
    confirmationToken: proposal.confirmationToken,
    confirmed: true,
    authorizedById: fixture.user.id,
    issueDate: new Date("2026-10-16T14:00:00.000Z"),
    ...overrides,
  });
  return { proposal, result };
}

test("Phase 3P: a standard EC$275 addition creates one exact native adjustment and immutable snapshot", async () => {
  const fixture = await createFixture({});
  const before = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
  const scheduleBefore = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.schedule!.id } });
  const { proposal, result } = await executeFromPreview(fixture);
  assert.equal(proposal.proratedAmount, "207.19");
  assert.equal(result.created, true);
  assert.equal(result.invoiceRequired, true);

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: result.invoice!.invoiceId },
    include: { lineItems: true, serviceSnapshots: true },
  });
  assert.equal(invoice.kind, "annual_adjustment");
  assert.equal(invoice.customerSubscriptionId, fixture.subscription.id);
  assert.equal(invoice.adjustmentGenerationKey, proposal.generationKey);
  assert.equal(invoice.status, "open");
  assert.equal(invoice.total.toFixed(2), "207.19");
  assert.equal(invoice.allowOnlinePayment, false);
  assert.equal(invoice.sentAt, null);
  assert.equal(invoice.lineItems.length, 1);
  assert.equal(invoice.serviceSnapshots.length, 1);
  assert.equal(invoice.serviceSnapshots[0].subscriptionItemId, fixture.item.id);
  assert.equal(invoice.serviceSnapshots[0].subscriptionItemRateId, fixture.item.rates[0].id);
  assert.equal(invoice.serviceSnapshots[0].agreedAmountPerCycleSnapshot?.toFixed(2), "275.00");
  assert.equal(invoice.serviceSnapshots[0].billedAmount.toFixed(2), "207.19");
  assert.equal(invoice.serviceSnapshots[0].servicePeriodStart?.toISOString().slice(0, 10), "2026-04-01");
  assert.equal(invoice.serviceSnapshots[0].servicePeriodEnd?.toISOString().slice(0, 10), "2027-01-01");

  const after = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
  const scheduleAfter = await prisma.recurringInvoiceSchedule.findUniqueOrThrow({ where: { id: fixture.schedule!.id } });
  assert.equal(after.nextBillingDate?.getTime(), before.nextBillingDate?.getTime());
  assert.equal(scheduleAfter.nextIssueDate.getTime(), scheduleBefore.nextIssueDate.getTime());
  assert.equal(scheduleAfter.lastInvoiceId, null);
});

test("Phase 3P: leap-year and renewal-boundary additions retain calendar semantics", async () => {
  const leap = await createFixture({
    anchorDate: "2024-01-01",
    nextBillingDate: "2025-01-01",
    activationDate: "2024-07-01",
  });
  const leapProposal = await getAnnualServiceAdjustmentProposal(leap.item.id);
  assert.equal(leapProposal.totalCalendarDays, 366);
  assert.equal(leapProposal.remainingCalendarDays, 184);
  assert.equal(leapProposal.proratedAmount, "138.25");

  const boundary = await createFixture({ activationDate: "2027-01-01" });
  const boundaryResult = await executeFromPreview(boundary);
  assert.equal(boundaryResult.proposal.invoiceRequired, false);
  assert.equal(boundaryResult.result.invoiceRequired, false);
  assert.equal(boundaryResult.result.invoice, null);
  assert.equal(await prisma.invoice.count({
    where: { adjustmentGenerationKey: boundaryResult.proposal.generationKey },
  }), 0);
});

test("Phase 3P: independent additions deduplicate retries and concurrent requests", async () => {
  const fixture = await createFixture({});
  const second = await prisma.subscriptionItem.create({
    data: {
      customerSubscriptionId: fixture.subscription.id,
      label: "Second independently added service",
      status: "active",
      serviceActivatedDate: new Date("2026-07-01T00:00:00.000Z"),
      billingEffectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      rates: {
        create: {
          billingIntervalMonths: 12,
          agreedAmountPerCycle: "200.00",
          currency: "XCD",
          effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
          classification: "negotiated",
        },
      },
    },
  });
  const firstProposal = await getAnnualServiceAdjustmentProposal(fixture.item.id);
  const concurrent = await Promise.all(Array.from({ length: 4 }, () =>
    createAnnualServiceAdjustmentInvoice({
      subscriptionItemId: fixture.item.id,
      generationKey: firstProposal.generationKey,
      confirmationToken: firstProposal.confirmationToken,
      confirmed: true,
      authorizedById: fixture.user.id,
      issueDate: new Date("2026-10-16T00:00:00.000Z"),
    })));
  assert.equal(concurrent.filter((entry) => entry.created).length, 1);
  assert.equal(new Set(concurrent.map((entry) => entry.invoice?.invoiceId)).size, 1);

  const secondProposal = await getAnnualServiceAdjustmentProposal(second.id);
  const secondResult = await createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: second.id,
    generationKey: secondProposal.generationKey,
    confirmationToken: secondProposal.confirmationToken,
    confirmed: true,
    authorizedById: fixture.user.id,
  });
  assert.equal(secondResult.created, true);
  assert.notEqual(secondResult.invoice!.invoiceId, concurrent[0].invoice!.invoiceId);
  assert.equal(await prisma.invoice.count({
    where: { customerSubscriptionId: fixture.subscription.id, kind: "annual_adjustment" },
  }), 2);
});

test("Phase 3P: failed finalization rolls back all adjustment rows and a corrected retry succeeds", async () => {
  const fixture = await createFixture({});
  const proposal = await getAnnualServiceAdjustmentProposal(fixture.item.id);
  const serial = 900_000 + Math.floor(Math.random() * 50_000);
  await prisma.invoice.create({
    data: {
      status: "open",
      kind: "one_off",
      number: `TL-INV-${serial}`,
      currency: "XCD",
    },
  });
  await prisma.invoiceSequence.upsert({
    where: { id: "default" },
    create: { id: "default", nextValue: serial - 1 },
    update: { nextValue: serial - 1 },
  });
  await assert.rejects(createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: fixture.item.id,
    generationKey: proposal.generationKey,
    confirmationToken: proposal.confirmationToken,
    confirmed: true,
    authorizedById: fixture.user.id,
  }), (caught: unknown) => caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002");
  assert.equal(await prisma.invoice.count({ where: { adjustmentGenerationKey: proposal.generationKey } }), 0);
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { subscriptionItemId: fixture.item.id } }), 0);

  await prisma.invoiceSequence.update({ where: { id: "default" }, data: { nextValue: serial } });
  const retried = await createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: fixture.item.id,
    generationKey: proposal.generationKey,
    confirmationToken: proposal.confirmationToken,
    confirmed: true,
    authorizedById: fixture.user.id,
  });
  assert.equal(retried.created, true);
  assert.equal(await prisma.invoiceServiceSnapshot.count({ where: { invoiceId: retried.invoice!.invoiceId } }), 1);
});

test("Phase 3P: issued snapshot values survive later commercial source changes", async () => {
  const fixture = await createFixture({ annualAmount: "240.00" });
  const first = await executeFromPreview(fixture);
  await prisma.subscriptionItemRate.update({
    where: { id: fixture.item.rates[0].id },
    data: { agreedAmountPerCycle: "300.00" },
  });
  const replay = await createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: fixture.item.id,
    generationKey: first.proposal.generationKey,
    confirmationToken: first.proposal.confirmationToken,
    confirmed: true,
    authorizedById: fixture.user.id,
  });
  assert.equal(replay.created, false);
  assert.equal(replay.invoice!.invoiceId, first.result.invoice!.invoiceId);
  assert.equal(replay.sourceDiscrepancy, true);
  const snapshot = await prisma.invoiceServiceSnapshot.findFirstOrThrow({
    where: { invoiceId: first.result.invoice!.invoiceId },
  });
  assert.equal(snapshot.agreedAmountPerCycleSnapshot?.toFixed(2), "240.00");
  assert.equal(snapshot.billedAmount.toFixed(2), first.proposal.proratedAmount);
});

test("Phase 3P: partial adjustment payments affect collection health without suspending service", async () => {
  const fixture = await createFixture({ createAssignment: true });
  const { result } = await executeFromPreview(fixture);
  const payment = await recordInvoicePayment({
    invoiceId: result.invoice!.invoiceId,
    amount: 100,
    method: "cheque",
  });
  assert.equal(payment.status, "partially_paid");
  assert.equal(payment.amountDue, 107.19);
  const summary = await getCanonicalSubscriptionBillingSummary(
    fixture.subscription.id,
    new Date("2026-10-24T00:00:00.000Z"),
    { NODE_ENV: "test", CANONICAL_NATIVE_BILLING_ENABLED: "true" },
  );
  assert.equal(summary.outstandingBalance, "107.19");
  assert.equal(summary.collectionHealth, "action_required");
  assert.equal((await prisma.subscriptionItem.findUniqueOrThrow({ where: { id: fixture.item.id } })).status, "active");
  assert.equal((await prisma.serviceAssignment.findUniqueOrThrow({ where: { id: fixture.assignment!.id } })).status, "active");
});

test("Phase 3P: mocked one-time Stripe payment replay records one payment and no provider mutation", async () => {
  const fixture = await createFixture({ collectionMethod: "stripe_autocharge" });
  const providerBefore = await prisma.subscriptionProviderLink.findUniqueOrThrow({ where: { id: fixture.providerLink!.id } });
  const { result } = await executeFromPreview(fixture);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoice!.invoiceId } });
  assert.equal(invoice.allowOnlinePayment, true);
  const paymentIntentId = `pi_${randomUUID()}`;
  const session = {
    id: `cs_${randomUUID()}`,
    mode: "payment",
    payment_intent: paymentIntentId,
    metadata: {
      tl_checkout_kind: "native_invoice",
      tl_invoice_id: invoice.id,
    },
  } as unknown as Stripe.Checkout.Session;
  let retrieves = 0;
  const dependencies = {
    retrievePaymentIntent: async () => {
      retrieves += 1;
      return {
        status: "succeeded" as const,
        amount_received: Number(invoice.total.times(100)),
        amount: Number(invoice.total.times(100)),
      };
    },
  };
  await recordNativeInvoiceStripeCheckout(session, dependencies);
  await recordNativeInvoiceStripeCheckout(session, dependencies);
  assert.equal(retrieves, 1);
  assert.equal(await prisma.payment.count({ where: { stripePaymentIntentId: paymentIntentId } }), 1);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "paid");
  const providerAfter = await prisma.subscriptionProviderLink.findUniqueOrThrow({ where: { id: fixture.providerLink!.id } });
  assert.equal(providerAfter.externalSubscriptionId, providerBefore.externalSubscriptionId);
  assert.equal(providerAfter.updatedAt.getTime(), providerBefore.updatedAt.getTime());
});

test("Phase 3P: the addition is excluded before renewal, included at renewal, and never double billed", async () => {
  const fixture = await createFixture({ includeBaselineItem: true });
  const beforeRenewal = await previewCanonicalSubscriptionCycle(
    fixture.subscription.id,
    new Date("2026-01-01T00:00:00.000Z"),
  );
  assert.equal(beforeRenewal.lines.length, 1);
  assert.ok(beforeRenewal.lines.every((line) => line.subscriptionItemId !== fixture.item.id));
  await executeFromPreview(fixture);
  const atRenewal = await previewCanonicalSubscriptionCycle(
    fixture.subscription.id,
    new Date("2027-01-01T00:00:00.000Z"),
  );
  assert.equal(atRenewal.lines.length, 2);
  assert.equal(atRenewal.lines.filter((line) => line.subscriptionItemId === fixture.item.id).length, 1);
  assert.equal(await prisma.invoiceServiceSnapshot.count({
    where: { subscriptionItemId: fixture.item.id },
  }), 1);
});

test("Phase 3P: explicit authorization, canonical control, feature, and production guards hold", async () => {
  const fixture = await createFixture({});
  const proposal = await getAnnualServiceAdjustmentProposal(fixture.item.id);
  await assert.rejects(createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: fixture.item.id,
    generationKey: proposal.generationKey,
    confirmationToken: proposal.confirmationToken,
    confirmed: false,
    authorizedById: fixture.user.id,
  }), (caught: unknown) => caught instanceof CanonicalAnnualAdjustmentError
    && caught.code === "EXPLICIT_CONFIRMATION_REQUIRED");

  const shadow = await createFixture({ controlMode: "shadow" });
  const shadowProposal = await getAnnualServiceAdjustmentProposal(shadow.item.id);
  await assert.rejects(createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: shadow.item.id,
    generationKey: shadowProposal.generationKey,
    confirmationToken: shadowProposal.confirmationToken,
    confirmed: true,
    authorizedById: shadow.user.id,
  }), (caught: unknown) => caught instanceof CanonicalAnnualAdjustmentError
    && caught.code === "CANONICAL_CONTROL_REQUIRED");

  const legacy = await createFixture({ controlMode: "legacy" });
  await assert.rejects(
    getAnnualServiceAdjustmentProposal(legacy.item.id),
    (caught: unknown) => caught instanceof CanonicalAnnualAdjustmentError
      && caught.code === "LEGACY_SUBSCRIPTION_PROTECTED",
  );
  await assert.rejects(createAnnualServiceAdjustmentInvoice({
    subscriptionItemId: fixture.item.id,
    generationKey: proposal.generationKey,
    confirmationToken: proposal.confirmationToken,
    confirmed: true,
    authorizedById: fixture.user.id,
    environment: { NODE_ENV: "production", CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED: "true" },
  }), (caught: unknown) => caught instanceof CanonicalAnnualAdjustmentError
    && caught.code === "PRODUCTION_EXECUTION_DISABLED");
  assert.equal(await prisma.invoice.count({ where: { customerSubscriptionId: fixture.subscription.id } }), 0);
});
