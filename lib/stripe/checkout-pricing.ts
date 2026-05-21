import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { formatSubscriptionChoiceLabel } from "@/lib/subscription-options/display";

import { resolveStripePriceId } from "./price-ids";

const PLAN_MONTHS = [1, 3, 6, 12] as const;

export function stripeCheckoutCurrency(): string {
  return (process.env.STRIPE_CHECKOUT_CURRENCY?.trim() || "xcd").toLowerCase();
}

/** Smallest currency unit (e.g. cents) for Checkout line items. */
export function xcdToStripeUnitAmount(amountXcd: number): number {
  return Math.round(amountXcd * 100);
}

export async function getDefaultMonthlyRateXcd(): Promise<number> {
  const oneMonth = await prisma.subscriptionOption.findUnique({
    where: { durationMonths: 1 },
    select: { priceXcd: true },
  });
  if (oneMonth) {
    return Number(oneMonth.priceXcd);
  }
  return 30;
}

export function parseMonthlyRateXcd(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t === "default") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 999_999) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

/** Total charged per billing period for a multi-month term at a given monthly rate. */
export function periodTotalXcd(monthlyRateXcd: number, durationMonths: number): number {
  const months = Math.trunc(durationMonths);
  if (months === 12) {
    // Match catalog 12-month discount vs 12 × 1-month list (330 vs 360 at $30/mo).
    const discount = 330 / (30 * 12);
    return Math.round(monthlyRateXcd * 12 * discount * 100) / 100;
  }
  return Math.round(monthlyRateXcd * months * 100) / 100;
}

export type CheckoutLineItem =
  | { type: "price_id"; priceId: string }
  | {
      type: "price_data";
      durationMonths: number;
      monthlyRateXcd: number;
      periodTotalXcd: number;
    };

/**
 * Catalog Price id when no custom monthly rate; otherwise dynamic recurring price_data.
 */
export async function resolveCheckoutLineItem(input: {
  durationMonths: number;
  monthlyRateXcd: number | null;
}): Promise<CheckoutLineItem | null> {
  const months = Math.trunc(input.durationMonths);
  if (!PLAN_MONTHS.includes(months as (typeof PLAN_MONTHS)[number])) {
    return null;
  }

  if (input.monthlyRateXcd == null) {
    const priceId = await resolveStripePriceId(months);
    if (priceId) {
      return { type: "price_id", priceId };
    }
    const defaultMonthly = await getDefaultMonthlyRateXcd();
    const period = periodTotalXcd(defaultMonthly, months);
    return {
      type: "price_data",
      durationMonths: months,
      monthlyRateXcd: defaultMonthly,
      periodTotalXcd: period,
    };
  }

  const period = periodTotalXcd(input.monthlyRateXcd, months);
  return {
    type: "price_data",
    durationMonths: months,
    monthlyRateXcd: input.monthlyRateXcd,
    periodTotalXcd: period,
  };
}

export async function listStripeCheckoutPlanOptions(monthlyRateXcd: number | null) {
  const plans = await prisma.subscriptionOption.findMany({
    where: { isActive: true, durationMonths: { in: [...PLAN_MONTHS] } },
    orderBy: { durationMonths: "asc" },
  });
  const defaultMonthly = await getDefaultMonthlyRateXcd();
  const monthly = monthlyRateXcd ?? defaultMonthly;

  const options: { durationMonths: number; label: string }[] = [];
  for (const p of plans) {
    const hasPriceId =
      monthlyRateXcd == null && (await resolveStripePriceId(p.durationMonths));
    const total =
      monthlyRateXcd != null
        ? periodTotalXcd(monthly, p.durationMonths)
        : hasPriceId
          ? Number(p.priceXcd)
          : periodTotalXcd(monthly, p.durationMonths);
    options.push({
      durationMonths: p.durationMonths,
      label: formatSubscriptionChoiceLabel(p.durationMonths, total),
    });
  }
  return options;
}

export function monthlyRateFromCustomer(
  stripeMonthlyRateXcd: Prisma.Decimal | null | undefined,
): number | null {
  if (stripeMonthlyRateXcd == null) return null;
  const n = Number(stripeMonthlyRateXcd);
  return Number.isFinite(n) && n > 0 ? n : null;
}
