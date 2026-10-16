import "server-only";

import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { addUtcMonths, startOfUtcDay } from "@/lib/billing/recurring-period";
import { prisma } from "@/lib/db";
import {
  assertCanonicalStripeExecutionEnabled,
  canonicalStripeExecutionEnabled,
  type CanonicalStripeExecutionEnvironment,
  type CanonicalStripeProviderMutationResult,
} from "@/lib/domain/canonical-stripe-execution";
import {
  assertCanonicalStripeLiveCanaryAuthorization,
  CanonicalStripeLiveCanaryError,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "@/lib/domain/canonical-stripe-live-canary";
import {
  buildCanonicalStripeRateGroups,
  planCanonicalStripeInvoiceAttribution,
  reconcileCanonicalStripeSubscription,
  type ObservedStripeInvoiceLine,
} from "@/lib/domain/canonical-stripe-shadow";
import {
  findCanonicalStripeOperationForWebhook,
  persistCanonicalStripeProviderResult,
} from "@/lib/services/canonical-stripe-execution-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { normalizeCanonicalStripeSubscription } from "@/lib/stripe/canonical-provider-normalization";
import { stripeInvoiceSubscriptionId } from "@/lib/stripe/invoice-subscription";

export type CanonicalStripeCheckoutWebhook = {
  kind: "checkout_completed" | "checkout_expired";
  eventId: string;
  eventCreatedAt: Date;
  operationKey: string;
  checkoutSessionId: string;
  externalSubscriptionId: string | null;
};

export type CanonicalStripeSubscriptionWebhook = {
  kind: "subscription_state";
  eventId: string;
  eventCreatedAt: Date;
  operationKey: string | null;
  providerResult: CanonicalStripeProviderMutationResult;
};

export type CanonicalStripeInvoiceWebhook = {
  kind: "invoice_finalized" | "invoice_paid" | "invoice_payment_failed" | "invoice_voided";
  eventId: string;
  eventCreatedAt: Date;
  externalInvoiceId: string;
  externalSubscriptionId: string;
  status: string;
  currency: string;
  total: Prisma.Decimal | string;
  amountPaid: Prisma.Decimal | string;
  periodStart: Date;
  periodEnd: Date;
  paymentIntentId: string | null;
  providerInvoiceNumber?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  lines: ObservedStripeInvoiceLine[];
};

export type CanonicalStripeNormalizedWebhook =
  | CanonicalStripeCheckoutWebhook
  | CanonicalStripeSubscriptionWebhook
  | CanonicalStripeInvoiceWebhook;

export type CanonicalStripeWebhookResult = {
  handled: boolean;
  stale: boolean;
  reconciliation: "reconciled" | "pending" | "manual_review" | null;
};

function majorAmount(minor: number | null | undefined, minorUnitExponent = 2): string {
  return new Prisma.Decimal(minor ?? 0)
    .dividedBy(new Prisma.Decimal(10).pow(minorUnitExponent))
    .toDecimalPlaces(minorUnitExponent)
    .toFixed(minorUnitExponent);
}

function invoiceLineSubscriptionItemId(line: Stripe.InvoiceLineItem): string | null {
  const legacy = line as Stripe.InvoiceLineItem & { subscription_item?: string | null };
  if (legacy.subscription_item) return legacy.subscription_item;
  const parent = (line as Stripe.InvoiceLineItem & {
    parent?: { subscription_item_details?: { subscription_item?: string | null } | null } | null;
  }).parent;
  return parent?.subscription_item_details?.subscription_item ?? null;
}

function normalizeInvoiceLines(invoice: Stripe.Invoice, minorUnitExponent = 2): ObservedStripeInvoiceLine[] {
  return (invoice.lines?.data ?? []).map((line) => ({
    externalInvoiceLineId: line.id,
    externalSubscriptionItemId: invoiceLineSubscriptionItemId(line),
    externalPriceId: line.price?.id ?? null,
    currency: (line.currency ?? invoice.currency ?? "xcd").toUpperCase(),
    quantity: line.quantity ?? 1,
    recurringSubtotal: majorAmount(line.amount, minorUnitExponent),
    discountAmount: majorAmount(line.discount_amounts?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0, minorUnitExponent),
    taxAmount: majorAmount(line.tax_amounts?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0, minorUnitExponent),
    creditAmount: "0.00",
  }));
}

function invoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const reference = invoice.payment_intent;
  return typeof reference === "string" ? reference : reference?.id ?? null;
}

function invoicePeriod(invoice: Stripe.Invoice): { start: Date; end: Date } | null {
  const periods = (invoice.lines?.data ?? [])
    .map((line) => line.period)
    .filter((period): period is { start: number; end: number } => Boolean(period?.start && period?.end));
  if (!periods.length) return null;
  return {
    start: new Date(Math.min(...periods.map((period) => period.start)) * 1000),
    end: new Date(Math.max(...periods.map((period) => period.end)) * 1000),
  };
}

export function normalizeCanonicalStripeWebhook(
  event: Stripe.Event,
  options: { minorUnitExponent?: number } = {},
): CanonicalStripeNormalizedWebhook | null {
  const minorUnitExponent = options.minorUnitExponent ?? 2;
  const eventCreatedAt = new Date(event.created * 1000);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const operationKey = session.metadata?.tl_canonical_operation_key?.trim();
    if (!operationKey) return null;
    const subscription = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
    return {
      kind: event.type === "checkout.session.completed" ? "checkout_completed" : "checkout_expired",
      eventId: event.id,
      eventCreatedAt,
      operationKey,
      checkoutSessionId: session.id,
      externalSubscriptionId: subscription,
    };
  }
  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    return {
      kind: "subscription_state",
      eventId: event.id,
      eventCreatedAt,
      operationKey: sub.metadata?.tl_canonical_operation_key?.trim() || null,
      providerResult: normalizeCanonicalStripeSubscription(sub, minorUnitExponent),
    };
  }
  if (
    event.type === "invoice.finalized"
    || event.type === "invoice.paid"
    || event.type === "invoice.payment_failed"
    || event.type === "invoice.voided"
  ) {
    const invoice = event.data.object as Stripe.Invoice;
    const externalSubscriptionId = stripeInvoiceSubscriptionId(invoice);
    const period = invoicePeriod(invoice);
    if (!externalSubscriptionId || !period) return null;
    return {
      kind: event.type.replace(".", "_") as CanonicalStripeInvoiceWebhook["kind"],
      eventId: event.id,
      eventCreatedAt,
      externalInvoiceId: invoice.id,
      externalSubscriptionId,
      status: invoice.status ?? "unknown",
      currency: (invoice.currency ?? "xcd").toUpperCase(),
      total: majorAmount(invoice.total ?? invoice.amount_due ?? 0, minorUnitExponent),
      amountPaid: majorAmount(invoice.amount_paid, minorUnitExponent),
      periodStart: period.start,
      periodEnd: period.end,
      paymentIntentId: invoicePaymentIntentId(invoice),
      providerInvoiceNumber: invoice.number,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdfUrl: invoice.invoice_pdf,
      lines: normalizeInvoiceLines(invoice, minorUnitExponent),
    };
  }
  return null;
}

async function canonicalReferenceExists(event: CanonicalStripeNormalizedWebhook): Promise<boolean> {
  if (event.kind === "checkout_completed" || event.kind === "checkout_expired") {
    return (await findCanonicalStripeOperationForWebhook({ operationKey: event.operationKey })) != null;
  }
  const externalSubscriptionId = event.kind === "subscription_state"
    ? event.providerResult.subscription.externalSubscriptionId
    : event.externalSubscriptionId;
  if (!externalSubscriptionId) return false;
  const [operation, link] = await Promise.all([
    findCanonicalStripeOperationForWebhook({
      operationKey: event.kind === "subscription_state" ? event.operationKey : null,
      externalSubscriptionId,
    }),
    prisma.subscriptionProviderLink.findFirst({
      where: {
        provider: "stripe",
        externalSubscriptionId,
        customerSubscription: { controlMode: "canonical" },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(operation || link);
}

async function recordCheckoutWebhook(event: CanonicalStripeCheckoutWebhook): Promise<CanonicalStripeWebhookResult> {
  const operation = await prisma.billingOperation.findUnique({ where: { operationKey: event.operationKey } });
  if (!operation || operation.type !== "canonical_stripe_activation") return { handled: false, stale: false, reconciliation: null };
  if (operation.status === "completed") return { handled: true, stale: true, reconciliation: "reconciled" };
  if (event.kind === "checkout_expired") {
    await prisma.billingOperation.update({
      where: { id: operation.id },
      data: {
        status: "retry_required",
        providerReference: event.checkoutSessionId,
        failureCode: "SESSION_EXPIRED",
        failureMessage: "Canonical activation Checkout expired before provider ownership was fulfilled.",
        nextRetryAt: new Date(),
      },
    });
    return { handled: true, stale: false, reconciliation: "pending" };
  }
  await prisma.billingOperation.update({
    where: { id: operation.id },
    data: {
      status: "pending",
      providerReference: event.checkoutSessionId,
      providerSubscriptionReference: event.externalSubscriptionId,
      failureCode: null,
      failureMessage: null,
    },
  });
  return { handled: true, stale: false, reconciliation: "pending" };
}

async function recordReconciliationIssue(input: {
  customerId: string;
  eventId: string;
  externalReference: string;
  reason: string;
  issues?: unknown;
}): Promise<void> {
  await recordOperationalEvent({
    category: "billing.reconciliation_required",
    summary: "Canonical Stripe reconciliation requires manual review",
    customerId: input.customerId,
    payload: {
      phase: "3B2",
      provider: "stripe",
      stripeEventId: input.eventId,
      externalReference: input.externalReference,
      reason: input.reason,
      issues: input.issues ?? null,
    } as Prisma.InputJsonValue,
  });
}

async function handleSubscriptionWebhook(
  event: CanonicalStripeSubscriptionWebhook,
): Promise<CanonicalStripeWebhookResult> {
  const externalSubscriptionId = event.providerResult.subscription.externalSubscriptionId;
  const operation = await findCanonicalStripeOperationForWebhook({
    operationKey: event.operationKey,
    externalSubscriptionId,
  });
  const operationState = operation
    ? await prisma.billingOperation.findUnique({ where: { id: operation.id }, select: { status: true } })
    : null;
  if (operation && operationState?.status !== "completed") {
    if (event.providerResult.rateGroups.length !== event.providerResult.subscription.items.length) {
      const row = await prisma.billingOperation.findUniqueOrThrow({
        where: { id: operation.id },
        select: { customerId: true },
      });
      await prisma.billingOperation.update({
        where: { id: operation.id },
        data: {
          status: "retry_required",
          failureCode: "RECONCILIATION_REQUIRED",
          failureMessage: "Provider webhook did not include exact rate-group fingerprints for every recurring item.",
          nextRetryAt: null,
        },
      });
      await recordReconciliationIssue({
        customerId: row.customerId,
        eventId: event.eventId,
        externalReference: externalSubscriptionId,
        reason: "missing_rate_group_fingerprints",
      });
      return { handled: true, stale: false, reconciliation: "manual_review" };
    }
    try {
      await persistCanonicalStripeProviderResult({
        operationId: operation.id,
        result: event.providerResult,
        providerEventAt: event.eventCreatedAt,
      });
      return { handled: true, stale: false, reconciliation: "reconciled" };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Canonical provider webhook reconciliation failed.";
      await prisma.billingOperation.updateMany({
        where: { id: operation.id, status: { not: "completed" } },
        data: {
          status: "retry_required",
          failureCode: "RECONCILIATION_REQUIRED",
          failureMessage: message.slice(0, 2000),
          nextRetryAt: null,
        },
      });
      throw caught;
    }
  }

  const link = await prisma.subscriptionProviderLink.findFirst({
    where: { provider: "stripe", externalSubscriptionId, customerSubscription: { controlMode: "canonical" } },
    include: {
      providerItems: { orderBy: { rateGroupFingerprint: "asc" } },
      customerSubscription: { include: { items: { include: { rates: true } } } },
    },
  });
  if (!link) return { handled: false, stale: false, reconciliation: null };
  if (link.lastSyncedAt && link.lastSyncedAt > event.eventCreatedAt) {
    return { handled: true, stale: true, reconciliation: null };
  }
  const subscription = link.customerSubscription;
  if (!subscription.nextBillingDate) {
    await recordReconciliationIssue({
      customerId: subscription.customerId,
      eventId: event.eventId,
      externalReference: externalSubscriptionId,
      reason: "next_billing_date_missing",
    });
    return { handled: true, stale: false, reconciliation: "manual_review" };
  }
  const expected = buildCanonicalStripeRateGroups(subscription, subscription.nextBillingDate, { requireActive: false });
  const reconciliation = reconcileCanonicalStripeSubscription({
    expected,
    providerLink: link,
    observed: event.providerResult.subscription,
    observedOwnerSubscriptionId: subscription.id,
  });
  await prisma.subscriptionProviderLink.update({
    where: { id: link.id },
    data: {
      providerStatus: event.providerResult.subscription.status,
      lastSyncedAt: event.eventCreatedAt,
      lastError: reconciliation.status === "matched"
        ? null
        : reconciliation.issues.map((issue) => issue.explanation).join(" ").slice(0, 2000),
      ...(event.providerResult.subscription.status === "canceled" ? { endedAt: event.eventCreatedAt } : {}),
    },
  });
  if (["past_due", "unpaid"].includes(event.providerResult.subscription.status ?? "")) {
    await prisma.customerSubscription.update({
      where: { id: subscription.id },
      data: { collectionHealth: "past_due" },
    });
  }
  if (event.providerResult.subscription.status === "canceled") {
    await prisma.customerSubscription.update({
      where: { id: subscription.id },
      data: { lifecycleStatus: "canceled", status: "canceled" },
    });
  }
  if (reconciliation.status !== "matched") {
    await recordReconciliationIssue({
      customerId: subscription.customerId,
      eventId: event.eventId,
      externalReference: externalSubscriptionId,
      reason: reconciliation.status,
      issues: reconciliation.issues,
    });
    return { handled: true, stale: false, reconciliation: "manual_review" };
  }
  return { handled: true, stale: false, reconciliation: "reconciled" };
}

function sameUtcDay(left: Date, right: Date): boolean {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

async function persistCanonicalInvoiceFulfillment(input: {
  event: CanonicalStripeInvoiceWebhook;
  billingInvoiceId: string;
  subscription: Prisma.CustomerSubscriptionGetPayload<{
    include: { items: { include: { rates: true } } };
  }>;
  link: Prisma.SubscriptionProviderLinkGetPayload<{ include: { providerItems: true } }>;
}): Promise<"reconciled" | "manual_review"> {
  const expected = buildCanonicalStripeRateGroups(
    input.subscription,
    input.event.periodStart,
    { requireActive: false },
  );
  const attribution = planCanonicalStripeInvoiceAttribution({
    externalInvoiceId: input.event.externalInvoiceId,
    externalSubscriptionId: input.event.externalSubscriptionId,
    periodStart: input.event.periodStart,
    periodEnd: input.event.periodEnd,
    expected,
    providerLink: input.link,
    lines: input.event.lines,
  });
  const total = new Prisma.Decimal(input.event.total).toDecimalPlaces(2);
  if (attribution.status !== "complete" || !total.equals(expected.expectedRecurringTotal)) {
    await recordReconciliationIssue({
      customerId: input.subscription.customerId,
      eventId: input.event.eventId,
      externalReference: input.event.externalInvoiceId,
      reason: attribution.status !== "complete" ? "invoice_allocation_limited" : "invoice_total_mismatch",
      issues: attribution.allocationLimitations,
    });
    return "manual_review";
  }

  const nativeStatus = input.event.kind === "invoice_paid"
    ? "paid" as const
    : input.event.kind === "invoice_voided"
      ? "void" as const
      : "open" as const;
  await prisma.$transaction(async (tx) => {
    let native = await tx.invoice.findUnique({ where: { billingInvoiceId: input.billingInvoiceId } });
    const paid = input.event.kind === "invoice_paid";
    if (!native) {
      native = await tx.invoice.create({
        data: {
          status: nativeStatus,
          kind: "subscription_mirror",
          customerId: input.subscription.customerId,
          customerSubscriptionId: input.subscription.id,
          currency: expected.currency,
          subtotal: total,
          total,
          amountPaid: paid ? total : new Prisma.Decimal(0),
          amountDue: paid ? new Prisma.Decimal(0) : total,
          issueDate: input.event.periodStart,
          dueDate: input.event.periodEnd,
          paidAt: paid ? input.event.eventCreatedAt : null,
          billingInvoiceId: input.billingInvoiceId,
        },
      });
      const lineIdByReference = new Map<string, string>();
      for (const [index, line] of [...input.event.lines]
        .sort((left, right) => left.externalInvoiceLineId.localeCompare(right.externalInvoiceLineId))
        .entries()) {
        const created = await tx.invoiceLineItem.create({
          data: {
            invoiceId: native.id,
            sortOrder: index,
            description: "Canonical Stripe recurring service group",
            quantity: line.quantity,
            unitPrice: new Prisma.Decimal(line.recurringSubtotal).dividedBy(Math.max(1, line.quantity)).toDecimalPlaces(2),
            lineTotal: new Prisma.Decimal(line.recurringSubtotal).toDecimalPlaces(2),
          },
        });
        lineIdByReference.set(line.externalInvoiceLineId, created.id);
      }
      await tx.invoiceServiceSnapshot.createMany({
        data: attribution.snapshots.map((snapshot) => ({
          invoiceId: native!.id,
          invoiceLineItemId: lineIdByReference.get(snapshot.externalInvoiceLineId) ?? null,
          subscriptionItemId: snapshot.subscriptionItemId,
          subscriptionItemRateId: snapshot.subscriptionItemRateId,
          serviceLabelSnapshot: snapshot.serviceLabelSnapshot,
          agreedAmountPerCycleSnapshot: snapshot.agreedAmountPerCycleSnapshot,
          billedAmount: snapshot.billedAmount,
          currency: snapshot.currency,
          servicePeriodStart: snapshot.servicePeriodStart,
          servicePeriodEnd: snapshot.servicePeriodEnd,
          providerInvoiceLineReference: snapshot.providerInvoiceLineReference,
          quantity: 1,
          allocationNotes: snapshot.replayKey,
        })),
        skipDuplicates: true,
      });
    } else {
      await tx.invoice.update({
        where: { id: native.id },
        data: {
          status: nativeStatus,
          amountPaid: paid ? total : native.amountPaid,
          amountDue: paid ? new Prisma.Decimal(0) : native.amountDue,
          paidAt: paid ? input.event.eventCreatedAt : native.paidAt,
        },
      });
    }
    if (paid && input.event.paymentIntentId) {
      const existingPayment = await tx.payment.findUnique({
        where: { stripePaymentIntentId: input.event.paymentIntentId },
        select: { invoiceId: true },
      });
      if (existingPayment && existingPayment.invoiceId !== native.id) {
        throw new Error("Stripe payment identifier is already attributed to another invoice.");
      }
      if (!existingPayment) {
        await tx.payment.create({
          data: {
          invoiceId: native.id,
          customerId: input.subscription.customerId,
          amount: new Prisma.Decimal(input.event.amountPaid).toDecimalPlaces(2),
          currency: expected.currency,
          method: "stripe",
          reference: input.event.externalInvoiceId,
          stripePaymentIntentId: input.event.paymentIntentId,
          receivedAt: input.event.eventCreatedAt,
          },
        });
      }
    }
    if (
      paid
      && input.subscription.nextBillingDate
      && sameUtcDay(input.event.periodEnd, input.subscription.nextBillingDate)
    ) {
      await tx.customerSubscription.update({
        where: { id: input.subscription.id },
        data: {
          nextBillingDate: addUtcMonths(
            startOfUtcDay(input.subscription.nextBillingDate),
            expected.billingIntervalMonths,
          ),
          collectionHealth: "current",
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return "reconciled";
}

async function handleInvoiceWebhook(event: CanonicalStripeInvoiceWebhook): Promise<CanonicalStripeWebhookResult> {
  const link = await prisma.subscriptionProviderLink.findFirst({
    where: {
      provider: "stripe",
      externalSubscriptionId: event.externalSubscriptionId,
      customerSubscription: { controlMode: "canonical" },
    },
    include: {
      providerItems: { orderBy: { rateGroupFingerprint: "asc" } },
      customerSubscription: { include: { items: { include: { rates: true } } } },
    },
  });
  if (!link) return { handled: false, stale: false, reconciliation: null };

  const existing = await prisma.billingInvoice.findUnique({
    where: { provider_externalInvoiceId: { provider: "stripe", externalInvoiceId: event.externalInvoiceId } },
  });
  if (existing?.providerEventCreatedAt && existing.providerEventCreatedAt > event.eventCreatedAt) {
    return { handled: true, stale: true, reconciliation: null };
  }
  if (existing?.status.toLowerCase() === "paid" && event.kind !== "invoice_paid") {
    return { handled: true, stale: true, reconciliation: "reconciled" };
  }
  const total = new Prisma.Decimal(event.total).toDecimalPlaces(2);
  const billingInvoice = await prisma.billingInvoice.upsert({
    where: { provider_externalInvoiceId: { provider: "stripe", externalInvoiceId: event.externalInvoiceId } },
    create: {
      customerId: link.customerSubscription.customerId,
      customerSubscriptionId: link.customerSubscription.id,
      subscriptionProviderLinkId: link.id,
      provider: "stripe",
      externalInvoiceId: event.externalInvoiceId,
      kind: "subscription",
      status: event.status,
      amountXcd: total,
      currency: event.currency,
      providerInvoiceNumber: event.providerInvoiceNumber,
      periodStart: event.periodStart,
      periodEnd: event.periodEnd,
      hostedInvoiceUrl: event.hostedInvoiceUrl,
      invoicePdfUrl: event.invoicePdfUrl,
      stripeSubscriptionId: event.externalSubscriptionId,
      paidAt: event.kind === "invoice_paid" ? event.eventCreatedAt : null,
      providerEventCreatedAt: event.eventCreatedAt,
    },
    update: {
      customerSubscriptionId: link.customerSubscription.id,
      subscriptionProviderLinkId: link.id,
      status: event.status,
      amountXcd: total,
      currency: event.currency,
      providerInvoiceNumber: event.providerInvoiceNumber,
      periodStart: event.periodStart,
      periodEnd: event.periodEnd,
      hostedInvoiceUrl: event.hostedInvoiceUrl,
      invoicePdfUrl: event.invoicePdfUrl,
      stripeSubscriptionId: event.externalSubscriptionId,
      ...(event.kind === "invoice_paid" ? { paidAt: event.eventCreatedAt } : {}),
      providerEventCreatedAt: event.eventCreatedAt,
    },
  });
  if (event.kind === "invoice_payment_failed") {
    await prisma.customerSubscription.update({
      where: { id: link.customerSubscription.id },
      data: { collectionHealth: "past_due" },
    });
  }
  const reconciliation = await persistCanonicalInvoiceFulfillment({
    event,
    billingInvoiceId: billingInvoice.id,
    subscription: link.customerSubscription,
    link,
  });
  return { handled: true, stale: false, reconciliation };
}

async function handleCanonicalStripeNormalizedWebhookCore(
  event: CanonicalStripeNormalizedWebhook,
): Promise<CanonicalStripeWebhookResult> {
  if (event.kind === "checkout_completed" || event.kind === "checkout_expired") {
    return recordCheckoutWebhook(event);
  }
  if (event.kind === "subscription_state") return handleSubscriptionWebhook(event);
  return handleInvoiceWebhook(event as CanonicalStripeInvoiceWebhook);
}

export async function handleCanonicalStripeNormalizedWebhook(
  event: CanonicalStripeNormalizedWebhook,
  environment: CanonicalStripeExecutionEnvironment = process.env,
): Promise<CanonicalStripeWebhookResult> {
  assertCanonicalStripeExecutionEnabled(environment);
  return handleCanonicalStripeNormalizedWebhookCore(event);
}

type LiveCanaryOperationMetadata = {
  phase?: string;
  proposal?: Omit<import("@/lib/domain/canonical-stripe-execution").CanonicalStripeOperationProposal, "billingAnchorDate" | "nextBillingDate"> & {
    billingAnchorDate: string;
    nextBillingDate: string;
  };
  liveCanaryAuthorization?: CanonicalStripeLiveCanaryAuthorization;
};

function canaryEvidence(stripeEvent: Stripe.Event): {
  operationKey: string | null;
  externalSubscriptionId: string | null;
  authorizationId: string | null;
  providerMode: string | null;
} {
  if (stripeEvent.type.startsWith("checkout.session.")) {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    return {
      operationKey: session.metadata?.tl_canonical_operation_key?.trim() || null,
      externalSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
      authorizationId: session.metadata?.tl_canary_authorization_id?.trim() || null,
      providerMode: session.metadata?.tl_provider_mode?.trim() || null,
    };
  }
  if (stripeEvent.type.startsWith("customer.subscription.")) {
    const subscription = stripeEvent.data.object as Stripe.Subscription;
    return {
      operationKey: subscription.metadata?.tl_canonical_operation_key?.trim()
        || subscription.metadata?.tl_canonical_last_operation_key?.trim()
        || null,
      externalSubscriptionId: subscription.id,
      authorizationId: subscription.metadata?.tl_canary_authorization_id?.trim() || null,
      providerMode: subscription.metadata?.tl_provider_mode?.trim() || null,
    };
  }
  if (stripeEvent.type.startsWith("invoice.")) {
    return {
      operationKey: null,
      externalSubscriptionId: stripeInvoiceSubscriptionId(stripeEvent.data.object as Stripe.Invoice),
      authorizationId: null,
      providerMode: null,
    };
  }
  if (stripeEvent.type.startsWith("payment_intent.")) {
    const payment = stripeEvent.data.object as Stripe.PaymentIntent;
    return {
      operationKey: payment.metadata?.tl_canonical_operation_key?.trim() || null,
      externalSubscriptionId: null,
      authorizationId: payment.metadata?.tl_canary_authorization_id?.trim() || null,
      providerMode: payment.metadata?.tl_provider_mode?.trim() || null,
    };
  }
  return { operationKey: null, externalSubscriptionId: null, authorizationId: null, providerMode: null };
}

/**
 * Production live-canary events use the existing verified Stripe endpoint but
 * never rely on the general canonical production switch. Exact durable owner
 * authorization is required before canonical fulfillment can run.
 */
export async function tryHandleCanonicalStripeLiveCanaryWebhookEvent(
  stripeEvent: Stripe.Event,
  environment: CanonicalStripeLiveCanaryEnvironment = process.env,
): Promise<boolean> {
  const evidence = canaryEvidence(stripeEvent);
  const operation = evidence.operationKey
    ? await prisma.billingOperation.findUnique({
        where: { operationKey: evidence.operationKey },
        select: { id: true, operationKey: true, customerId: true, customerSubscriptionId: true, providerSubscriptionReference: true, metadata: true },
      })
    : evidence.externalSubscriptionId
      ? await prisma.billingOperation.findFirst({
          where: {
            operationKey: { startsWith: "canonical-stripe-live-canary:" },
            providerSubscriptionReference: evidence.externalSubscriptionId,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, operationKey: true, customerId: true, customerSubscriptionId: true, providerSubscriptionReference: true, metadata: true },
        })
      : null;
  const metadata = operation?.metadata && typeof operation.metadata === "object" && !Array.isArray(operation.metadata)
    ? operation.metadata as LiveCanaryOperationMetadata
    : null;
  const hasCanaryEvidence = evidence.providerMode === "live_canary"
    || Boolean(evidence.authorizationId)
    || operation?.operationKey.startsWith("canonical-stripe-live-canary:") === true
    || metadata?.phase === "3B3B";
  if (!hasCanaryEvidence) return false;
  if (stripeEvent.livemode !== true) {
    throw new CanonicalStripeLiveCanaryError("CANARY_LIVE_WEBHOOK_REQUIRED", "Live canary ownership was presented by a non-live Stripe event.");
  }
  if (!operation || !operation.customerSubscriptionId || !metadata?.proposal || !metadata.liveCanaryAuthorization) {
    throw new CanonicalStripeLiveCanaryError("CANARY_WEBHOOK_OWNERSHIP_INCOMPLETE", "Live canary webhook lacks an exact durable operation.");
  }
  if (evidence.authorizationId && evidence.authorizationId !== metadata.liveCanaryAuthorization.authorizationId) {
    throw new CanonicalStripeLiveCanaryError("CANARY_WEBHOOK_AUTHORIZATION_MISMATCH", "Webhook authorization identity differs from the durable canary approval.");
  }
  const proposal = {
    ...metadata.proposal,
    billingAnchorDate: new Date(metadata.proposal.billingAnchorDate),
    nextBillingDate: new Date(metadata.proposal.nextBillingDate),
  };
  assertCanonicalStripeLiveCanaryAuthorization({
    proposal,
    authorization: metadata.liveCanaryAuthorization,
    environment,
    // Webhook fulfillment remains valid after the short execution window. The
    // signature and all approved terms are still revalidated at issuedAt.
    now: new Date(metadata.liveCanaryAuthorization.issuedAt),
  });
  if (proposal.customerId !== operation.customerId || proposal.subscriptionId !== operation.customerSubscriptionId) {
    throw new CanonicalStripeLiveCanaryError("CANARY_WEBHOOK_OPERATION_MISMATCH", "Webhook operation identity is inconsistent.");
  }
  if (
    evidence.externalSubscriptionId
    && operation.providerSubscriptionReference
    && evidence.externalSubscriptionId !== operation.providerSubscriptionReference
  ) {
    throw new CanonicalStripeLiveCanaryError("CANARY_WEBHOOK_SUBSCRIPTION_MISMATCH", "Webhook subscription differs from the durable provider reference.");
  }
  const competing = await prisma.billingOperation.findFirst({
    where: { operationKey: { startsWith: "canonical-stripe-live-canary:" }, id: { not: operation.id } },
    select: { id: true },
  });
  if (competing) {
    throw new CanonicalStripeLiveCanaryError("CANARY_MULTIPLE_OPERATIONS", "Multiple live canary operations exist; webhook fulfillment is blocked.");
  }

  // PaymentIntent events are secondary to invoice events for recurring
  // subscriptions. Claiming them here prevents legacy fulfillment; the signed
  // invoice event performs the durable financial reconciliation.
  if (stripeEvent.type.startsWith("payment_intent.")) return true;
  const normalized = normalizeCanonicalStripeWebhook(stripeEvent, { minorUnitExponent: 2 });
  if (!normalized) {
    throw new CanonicalStripeLiveCanaryError("CANARY_WEBHOOK_EVIDENCE_INCOMPLETE", "Canary webhook lacks required period or item evidence.");
  }
  await handleCanonicalStripeNormalizedWebhookCore(normalized);
  return true;
}

/** Return false only when the event has no exact canonical operation or provider relationship. */
export async function tryHandleCanonicalStripeWebhookEvent(
  stripeEvent: Stripe.Event,
  environment: CanonicalStripeExecutionEnvironment = process.env,
  options: { minorUnitExponent?: number } = {},
): Promise<boolean> {
  const normalized = normalizeCanonicalStripeWebhook(stripeEvent, options);
  if (!normalized) {
    let operationKey: string | null = null;
    let externalSubscriptionId: string | null = null;
    if (stripeEvent.type.startsWith("checkout.session.")) {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      operationKey = session.metadata?.tl_canonical_operation_key?.trim() || null;
      externalSubscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;
    } else if (stripeEvent.type.startsWith("customer.subscription.")) {
      const subscription = stripeEvent.data.object as Stripe.Subscription;
      operationKey = subscription.metadata?.tl_canonical_operation_key?.trim() || null;
      externalSubscriptionId = subscription.id;
    } else if (stripeEvent.type.startsWith("invoice.")) {
      externalSubscriptionId = stripeInvoiceSubscriptionId(stripeEvent.data.object as Stripe.Invoice);
    }
    const operation = await findCanonicalStripeOperationForWebhook({ operationKey, externalSubscriptionId });
    const link = externalSubscriptionId
      ? await prisma.subscriptionProviderLink.findFirst({
          where: {
            provider: "stripe",
            externalSubscriptionId,
            customerSubscription: { controlMode: "canonical" },
          },
          select: { id: true },
        })
      : null;
    if (!operation && !link) return false;
    assertCanonicalStripeExecutionEnabled(environment);
    throw new Error("Canonical Stripe webhook lacks the exact billing-period or item evidence required for safe fulfillment.");
  }
  const canonical = await canonicalReferenceExists(normalized);
  if (!canonical) return false;
  if (!canonicalStripeExecutionEnabled(environment)) {
    assertCanonicalStripeExecutionEnabled(environment);
  }
  await handleCanonicalStripeNormalizedWebhook(normalized, environment);
  return true;
}
