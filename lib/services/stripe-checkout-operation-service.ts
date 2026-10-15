import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma, type Customer } from "@prisma/client";
import type Stripe from "stripe";

import {
  coordinateStripeCheckoutOperation,
  checkoutCompletionRequiresReconciliation,
  type CheckoutOperationSnapshot,
  type CheckoutProviderSession,
  type PreparedCheckoutOperation,
} from "@/lib/billing/stripe-checkout-operation-coordinator";
import { prisma } from "@/lib/db";
import { createStripeSubscriptionCheckout } from "@/lib/stripe/checkout";
import { getStripeClient } from "@/lib/stripe/config";
import { ensureStripeCustomerForTlCustomer } from "@/lib/stripe/customer";

const ACTIVE_CHECKOUT_PREFIX = "stripe-checkout:";
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid"] as const;

export type StripeCheckoutOperationInput = {
  customer: Customer;
  durationMonths: number;
  monthlyRateXcd: number | null;
  vehicleCount: number;
  useCustomPricing?: boolean;
  feePassthrough: boolean;
};

export function stripeCheckoutRequestFingerprint(
  input: Omit<StripeCheckoutOperationInput, "customer">,
): string {
  const canonical = JSON.stringify({
    durationMonths: input.durationMonths,
    monthlyRateXcd: input.monthlyRateXcd == null ? null : Number(input.monthlyRateXcd.toFixed(2)),
    vehicleCount: input.vehicleCount,
    useCustomPricing: Boolean(input.useCustomPricing),
    feePassthrough: input.feePassthrough,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function operationSnapshot(row: {
  id: string;
  operationKey: string;
  customerSubscriptionId: string | null;
  providerReference: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
}): CheckoutOperationSnapshot {
  if (!row.customerSubscriptionId) {
    throw new Error("Checkout operation is missing its local subscription reference.");
  }
  return {
    id: row.id,
    operationKey: row.operationKey,
    customerSubscriptionId: row.customerSubscriptionId,
    providerReference: row.providerReference,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
  };
}

function providerSession(session: Stripe.Checkout.Session): CheckoutProviderSession {
  const subscriptionReference = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  return {
    id: session.id,
    status: session.status ?? "expired",
    url: session.url ?? null,
    subscriptionReference,
  };
}

function decimalEquals(value: Prisma.Decimal | null, expected: number | null): boolean {
  if (value == null || expected == null) return value == null && expected == null;
  return value.equals(new Prisma.Decimal(expected));
}

async function prepareCheckoutOperation(
  input: StripeCheckoutOperationInput,
  fingerprint: string,
): Promise<PreparedCheckoutOperation> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Customer" WHERE "id" = ${input.customer.id} FOR UPDATE
    `;
    if (!locked.length) throw new Error("Customer not found.");

    const activeSubscription = await tx.customerSubscription.findFirst({
      where: {
        customerId: input.customer.id,
        controlMode: "legacy",
        status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
        stripeSubscriptionId: { not: null },
      },
      select: { id: true },
    });
    if (activeSubscription) {
      throw new Error(
        "This customer already has an active Stripe billing arrangement. Reconcile it before starting another Checkout.",
      );
    }

    const activeKey = `${ACTIVE_CHECKOUT_PREFIX}${input.customer.id}`;
    const existingOperation = await tx.billingOperation.findUnique({ where: { activeKey } });
    if (
      existingOperation
      && ["SUPERSEDED_CHECKOUT_COMPLETED", "CHECKOUT_ALREADY_COMPLETED", "REPLACEMENT_LIMIT"].includes(
        existingOperation.failureCode ?? "",
      )
    ) {
      throw new Error(
        "A prior Checkout may already have completed. Reconcile the Stripe billing operation before creating another Session.",
      );
    }
    if (
      existingOperation
      && existingOperation.requestFingerprint === fingerprint
      && ["pending", "in_progress", "retry_required"].includes(existingOperation.status)
    ) {
      return { operation: operationSnapshot(existingOperation) };
    }

    const supersededProviderReference = existingOperation?.providerReference ?? null;
    if (existingOperation) {
      await tx.billingOperation.update({
        where: { id: existingOperation.id },
        data: {
          activeKey: null,
          status: "failed",
          failureCode: "SUPERSEDED",
          failureMessage: "Replaced by a newer Checkout activation request.",
        },
      });
    }

    const pending = await tx.customerSubscription.findFirst({
      where: {
        customerId: input.customer.id,
        controlMode: "legacy",
        status: "pending_payment",
        stripeSubscriptionId: null,
      },
      orderBy: { updatedAt: "desc" },
    });
    const canReusePending = Boolean(
      pending
      && pending.planTermMonths === input.durationMonths
      && pending.vehicleCount === input.vehicleCount
      && decimalEquals(pending.monthlyRateXcd, input.monthlyRateXcd),
    );

    await tx.customerSubscription.updateMany({
      where: {
        customerId: input.customer.id,
        controlMode: "legacy",
        status: "pending_payment",
        stripeSubscriptionId: null,
        ...(canReusePending && pending ? { id: { not: pending.id } } : {}),
      },
      data: { status: "canceled" },
    });

    const subscription = canReusePending && pending
      ? pending
      : await tx.customerSubscription.create({
          data: {
            customerId: input.customer.id,
            status: "pending_payment",
            planTermMonths: input.durationMonths,
            monthlyRateXcd: input.monthlyRateXcd != null
              ? new Prisma.Decimal(input.monthlyRateXcd)
              : null,
            vehicleCount: input.vehicleCount,
          },
        });

    const operationKey = randomUUID();
    const created = await tx.billingOperation.create({
      data: {
        type: "stripe_checkout_activation",
        status: "pending",
        customerId: input.customer.id,
        customerSubscriptionId: subscription.id,
        operationKey,
        activeKey,
        requestFingerprint: fingerprint,
        metadata: {
          durationMonths: input.durationMonths,
          monthlyRateXcd: input.monthlyRateXcd,
          vehicleCount: input.vehicleCount,
          useCustomPricing: Boolean(input.useCustomPricing),
          feePassthrough: input.feePassthrough,
        },
      },
    });
    return { operation: operationSnapshot(created), supersededProviderReference };
  });
}

async function replaceExpiredCheckoutOperation(operationId: string): Promise<CheckoutOperationSnapshot> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.billingOperation.findUnique({ where: { id: operationId } });
    if (!current) throw new Error("Checkout operation not found.");
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Customer" WHERE "id" = ${current.customerId} FOR UPDATE
    `;
    if (!locked.length) throw new Error("Customer not found.");

    const activeKey = `${ACTIVE_CHECKOUT_PREFIX}${current.customerId}`;
    const replacement = await tx.billingOperation.findUnique({ where: { activeKey } });
    if (replacement && replacement.id !== current.id) {
      if (replacement.requestFingerprint !== current.requestFingerprint) {
        throw new Error("A newer Checkout request has replaced this operation.");
      }
      return operationSnapshot(replacement);
    }

    await tx.billingOperation.update({
      where: { id: current.id },
      data: {
        activeKey: null,
        status: "failed",
        failureCode: "SESSION_EXPIRED",
        failureMessage: "Stripe Checkout Session expired before completion.",
      },
    });
    const created = await tx.billingOperation.create({
      data: {
        type: current.type,
        status: "pending",
        customerId: current.customerId,
        customerSubscriptionId: current.customerSubscriptionId,
        operationKey: randomUUID(),
        activeKey,
        requestFingerprint: current.requestFingerprint,
        metadata: current.metadata ?? Prisma.JsonNull,
      },
    });
    return operationSnapshot(created);
  });
}

export async function runStripeCheckoutOperation(input: StripeCheckoutOperationInput) {
  const fingerprint = stripeCheckoutRequestFingerprint({
    durationMonths: input.durationMonths,
    monthlyRateXcd: input.monthlyRateXcd,
    vehicleCount: input.vehicleCount,
    useCustomPricing: input.useCustomPricing,
    feePassthrough: input.feePassthrough,
  });

  const existingActive = await prisma.customerSubscription.findFirst({
    where: {
      customerId: input.customer.id,
      controlMode: "legacy",
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
      stripeSubscriptionId: { not: null },
    },
    select: { id: true },
  });
  if (existingActive) {
    return {
      ok: false as const,
      error: "This customer already has an active Stripe billing arrangement. Reconcile it before starting another Checkout.",
      conflict: true,
    };
  }

  const { stripeCustomerId } = await ensureStripeCustomerForTlCustomer(input.customer);
  const stripe = getStripeClient();

  return coordinateStripeCheckoutOperation({
    prepare: () => prepareCheckoutOperation(input, fingerprint),
    replaceExpired: replaceExpiredCheckoutOperation,
    beginAttempt: async (operationId) => {
      await prisma.billingOperation.update({
        where: { id: operationId },
        data: {
          status: "in_progress",
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          failureCode: null,
          failureMessage: null,
        },
      });
    },
    retrieveSession: async (providerReference) =>
      providerSession(await stripe.checkout.sessions.retrieve(providerReference)),
    recoverSession: async (operationKey, customerSubscriptionId) => {
      const sessions = await stripe.checkout.sessions.list({ customer: stripeCustomerId, limit: 100 });
      const found = sessions.data.find(
        (session) =>
          session.metadata?.tl_billing_operation_key === operationKey
          || session.metadata?.tl_subscription_id === customerSubscriptionId,
      );
      return found ? providerSession(found) : null;
    },
    createSession: async (idempotencyKey, operationKey) => {
      const operation = await prisma.billingOperation.findUnique({
        where: { operationKey },
        select: { customerSubscriptionId: true },
      });
      if (!operation?.customerSubscriptionId) {
        throw new Error("Checkout operation has no pending subscription.");
      }
      const created = await createStripeSubscriptionCheckout({
        customer: input.customer,
        durationMonths: input.durationMonths,
        tlSubscriptionId: operation.customerSubscriptionId,
        monthlyRateXcd: input.monthlyRateXcd,
        vehicleCount: input.vehicleCount,
        useCustomPricing: input.useCustomPricing,
        feePassthrough: input.feePassthrough,
        operationKey,
        idempotencyKey,
        stripeCustomerId,
      });
      return {
        id: created.sessionId,
        status: "open",
        url: created.url,
        subscriptionReference: null,
      };
    },
    expireSession: async (providerReference, idempotencyKey) =>
      providerSession(
        await stripe.checkout.sessions.expire(providerReference, {}, { idempotencyKey }),
      ),
    recordProviderSession: async (operationId, session) => {
      await prisma.billingOperation.update({
        where: { id: operationId },
        data: {
          providerReference: session.id,
          providerSubscriptionReference: session.subscriptionReference,
          status: session.status === "open" ? "pending" : "in_progress",
        },
      });
    },
    markRetryRequired: async (operationId, code, message) => {
      await prisma.billingOperation.update({
        where: { id: operationId },
        data: {
          status: "retry_required",
          failureCode: code,
          failureMessage: message.slice(0, 2000),
          nextRetryAt: new Date(),
        },
      });
    },
  });
}

export async function recordStripeCheckoutCompletion(
  session: Stripe.Checkout.Session,
  stripeSubscriptionId: string,
  customerId: string | null,
): Promise<void> {
  const operationKey = session.metadata?.tl_billing_operation_key?.trim();
  const operation = operationKey
    ? await prisma.billingOperation.findUnique({ where: { operationKey } })
    : await prisma.billingOperation.findFirst({
        where: { providerReference: session.id },
        orderBy: { createdAt: "desc" },
      });
  if (!operation) return;

  if (
    operation.status === "completed"
    && operation.providerSubscriptionReference === stripeSubscriptionId
  ) {
    return;
  }

  const resolvedCustomerId = customerId ?? operation.customerId;
  const superseded = operation.failureCode === "SUPERSEDED" || operation.activeKey == null;
  const conflictingSubscription = await prisma.customerSubscription.findFirst({
    where: {
      customerId: resolvedCustomerId,
      controlMode: "legacy",
      id: { not: operation.customerSubscriptionId ?? undefined },
      stripeSubscriptionId: { not: null, notIn: [stripeSubscriptionId] },
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
    },
    select: { id: true, stripeSubscriptionId: true },
  });

  if (checkoutCompletionRequiresReconciliation({
    operationWasSuperseded: superseded,
    anotherActiveSubscriptionExists: Boolean(conflictingSubscription),
  })) {
    await prisma.billingOperation.update({
      where: { id: operation.id },
      data: {
        status: "retry_required",
        activeKey: null,
        providerReference: session.id,
        providerSubscriptionReference: stripeSubscriptionId,
        failureCode: "SUPERSEDED_CHECKOUT_COMPLETED",
        failureMessage: conflictingSubscription
          ? "A superseded Checkout completed after another Stripe subscription became active. Manual reconciliation is required."
          : "A superseded Checkout completed successfully. Verify the resulting Stripe subscription before continuing.",
        nextRetryAt: null,
      },
    });
    return;
  }

  await prisma.billingOperation.update({
    where: { id: operation.id },
    data: {
      status: "completed",
      activeKey: null,
      providerReference: session.id,
      providerSubscriptionReference: stripeSubscriptionId,
      completedAt: new Date(),
      nextRetryAt: null,
      failureCode: null,
      failureMessage: null,
    },
  });
}

export async function recordStripeCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const operationKey = session.metadata?.tl_billing_operation_key?.trim();
  const operation = operationKey
    ? await prisma.billingOperation.findUnique({ where: { operationKey } })
    : await prisma.billingOperation.findFirst({ where: { providerReference: session.id } });
  if (!operation || operation.status === "completed") return;
  await prisma.billingOperation.update({
    where: { id: operation.id },
    data: {
      status: "retry_required",
      providerReference: session.id,
      failureCode: "SESSION_EXPIRED",
      failureMessage: "Stripe Checkout Session expired before payment. Recovery or replacement is required.",
      nextRetryAt: new Date(),
    },
  });
}
