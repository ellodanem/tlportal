import "server-only";

import { Prisma, type CustomerSubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { stripeSubscriptionStatusToTl } from "@/lib/domain/customer-subscription";

function parseDurationMonthsFromSubscription(sub: Stripe.Subscription): number | null {
  const fromMeta = sub.metadata?.tl_duration_months?.trim();
  if (fromMeta) {
    const n = Number.parseInt(fromMeta, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (price && typeof price !== "string" && price.recurring?.interval === "month") {
    const count = price.recurring.interval_count ?? 1;
    if (count > 0) return count;
  }
  return null;
}

function parseMonthlyRateXcdFromSubscription(sub: Stripe.Subscription): Prisma.Decimal | null {
  const fromMeta = sub.metadata?.tl_monthly_rate_xcd?.trim();
  if (fromMeta) {
    const n = Number.parseFloat(fromMeta);
    if (Number.isFinite(n) && n > 0) {
      return new Prisma.Decimal(n);
    }
  }
  return null;
}

function periodDatesFromSubscription(sub: Stripe.Subscription): {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
} {
  return {
    currentPeriodStart:
      sub.current_period_start != null
        ? new Date(sub.current_period_start * 1000)
        : null,
    currentPeriodEnd:
      sub.current_period_end != null ? new Date(sub.current_period_end * 1000) : null,
    cancelAt: sub.cancel_at != null ? new Date(sub.cancel_at * 1000) : null,
  };
}

export async function getCurrentCustomerSubscription(customerId: string) {
  return prisma.customerSubscription.findFirst({
    where: { customerId },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Create a pending TL subscription before Stripe Checkout (metadata links session → row).
 */
export async function createPendingCustomerSubscription(input: {
  customerId: string;
  planTermMonths: number;
  monthlyRateXcd?: number | null;
  vehicleCount?: number | null;
}): Promise<{ id: string }> {
  await prisma.customerSubscription.updateMany({
    where: {
      customerId: input.customerId,
      status: "pending_payment",
      stripeSubscriptionId: null,
    },
    data: { status: "canceled" },
  });

  const row = await prisma.customerSubscription.create({
    data: {
      customerId: input.customerId,
      status: "pending_payment",
      planTermMonths: input.planTermMonths,
      monthlyRateXcd:
        input.monthlyRateXcd != null && input.monthlyRateXcd > 0
          ? new Prisma.Decimal(input.monthlyRateXcd)
          : null,
      vehicleCount: input.vehicleCount ?? null,
    },
    select: { id: true },
  });

  return row;
}

/**
 * Upsert TL subscription from a Stripe subscription object (webhooks + sync).
 */
export async function upsertCustomerSubscriptionFromStripe(
  sub: Stripe.Subscription,
  tlCustomerId: string,
): Promise<{ id: string }> {
  const stripeSubscriptionId = sub.id;
  const stripeCustomerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
  const status = stripeSubscriptionStatusToTl(sub.status);
  const planTermMonths = parseDurationMonthsFromSubscription(sub) ?? 1;
  const monthlyRateXcd = parseMonthlyRateXcdFromSubscription(sub);
  const periods = periodDatesFromSubscription(sub);
  const tlSubscriptionId = sub.metadata?.tl_subscription_id?.trim();

  const baseData = {
    customerId: tlCustomerId,
    status,
    planTermMonths,
    monthlyRateXcd,
    stripeSubscriptionId,
    stripeCustomerId,
    ...periods,
  };

  if (tlSubscriptionId) {
    const existing = await prisma.customerSubscription.findUnique({
      where: { id: tlSubscriptionId },
      select: { id: true, customerId: true },
    });
    if (existing?.customerId === tlCustomerId) {
      const updated = await prisma.customerSubscription.update({
        where: { id: tlSubscriptionId },
        data: baseData,
        select: { id: true },
      });
      return updated;
    }
  }

  const byStripe = await prisma.customerSubscription.findUnique({
    where: { stripeSubscriptionId },
    select: { id: true },
  });
  if (byStripe) {
    const updated = await prisma.customerSubscription.update({
      where: { id: byStripe.id },
      data: baseData,
      select: { id: true },
    });
    return updated;
  }

  const created = await prisma.customerSubscription.create({
    data: baseData,
    select: { id: true },
  });
  return created;
}

export async function markCustomerSubscriptionCanceledFromStripe(
  sub: Stripe.Subscription,
  tlCustomerId: string,
): Promise<void> {
  const stripeSubscriptionId = sub.id;
  const periods = periodDatesFromSubscription(sub);
  const tlSubscriptionId = sub.metadata?.tl_subscription_id?.trim();

  let row =
    (tlSubscriptionId
      ? await prisma.customerSubscription.findFirst({
          where: { id: tlSubscriptionId, customerId: tlCustomerId },
        })
      : null) ??
    (await prisma.customerSubscription.findUnique({
      where: { stripeSubscriptionId },
    })) ??
    (await prisma.customerSubscription.findFirst({
      where: { customerId: tlCustomerId },
      orderBy: { updatedAt: "desc" },
    }));

  if (!row) {
    await prisma.customerSubscription.create({
      data: {
        customerId: tlCustomerId,
        status: "canceled",
        planTermMonths: parseDurationMonthsFromSubscription(sub) ?? 1,
        monthlyRateXcd: parseMonthlyRateXcdFromSubscription(sub),
        stripeSubscriptionId,
        stripeCustomerId:
          typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
        ...periods,
      },
    });
    return;
  }

  await prisma.customerSubscription.update({
    where: { id: row.id },
    data: {
      status: "canceled",
      stripeSubscriptionId,
      stripeCustomerId:
        typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
      ...periods,
    },
  });
}

export function isSubscriptionAttentionStatus(status: CustomerSubscriptionStatus): boolean {
  return status === "past_due" || status === "unpaid";
}
