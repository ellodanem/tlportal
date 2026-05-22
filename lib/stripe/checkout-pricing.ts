import "server-only";

import { Prisma } from "@prisma/client";

import { isCatalogRateTier, normalizeRateXcd } from "@/lib/domain/billing-catalog";
import { prisma } from "@/lib/db";
import { formatPlanTerm } from "@/lib/subscription-options/display";

import { resolveCatalogStripePriceId } from "./catalog-price-ids";

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
  return normalizeRateXcd(n);
}

export function parseVehicleCount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 9999) {
    return null;
  }
  return n;
}

/** Total charged per billing period for one vehicle at a multi-month term. */
export function periodTotalPerVehicleXcd(monthlyRateXcd: number, durationMonths: number): number {
  const months = Math.trunc(durationMonths);
  if (months === 12) {
    const discount = 330 / (30 * 12);
    return Math.round(monthlyRateXcd * 12 * discount * 100) / 100;
  }
  return Math.round(monthlyRateXcd * months * 100) / 100;
}

export type CheckoutLineItem =
  | { type: "price_id"; priceId: string; quantity: number; monthlyRateXcd: number; durationMonths: number }
  | {
      type: "price_data";
      durationMonths: number;
      monthlyRateXcd: number;
      periodTotalPerVehicleXcd: number;
      quantity: number;
      catalogFallback?: boolean;
    };

export type ResolveCheckoutInput = {
  durationMonths: number;
  /** Null = default catalog tier (typically $30/mo per vehicle). */
  monthlyRateXcd: number | null;
  vehicleCount: number;
  /** Force dynamic price_data (non-catalog custom rate). */
  useCustomPricing?: boolean;
};

/**
 * Catalog Stripe Price × vehicle quantity when tier/term are configured; else dynamic per-vehicle price_data.
 */
export async function resolveCheckoutLineItem(
  input: ResolveCheckoutInput,
): Promise<CheckoutLineItem | null> {
  const months = Math.trunc(input.durationMonths);
  if (!PLAN_MONTHS.includes(months as (typeof PLAN_MONTHS)[number])) {
    return null;
  }

  const quantity = Math.max(1, Math.trunc(input.vehicleCount));
  const defaultMonthly = await getDefaultMonthlyRateXcd();
  const monthly = input.monthlyRateXcd ?? defaultMonthly;
  const useCustom = input.useCustomPricing === true || !isCatalogRateTier(monthly);

  if (!useCustom) {
    const priceId = await resolveCatalogStripePriceId(monthly, months);
    if (priceId) {
      return {
        type: "price_id",
        priceId,
        quantity,
        monthlyRateXcd: monthly,
        durationMonths: months,
      };
    }
  }

  const periodPerVehicle = periodTotalPerVehicleXcd(monthly, months);
  return {
    type: "price_data",
    durationMonths: months,
    monthlyRateXcd: monthly,
    periodTotalPerVehicleXcd: periodPerVehicle,
    quantity,
    catalogFallback: !useCustom,
  };
}

export async function listStripeCheckoutPlanOptions(input: {
  monthlyRateXcd: number | null;
  vehicleCount: number;
  useCustomPricing?: boolean;
}) {
  const plans = await prisma.subscriptionOption.findMany({
    where: { isActive: true, durationMonths: { in: [...PLAN_MONTHS] } },
    orderBy: { durationMonths: "asc" },
  });
  const defaultMonthly = await getDefaultMonthlyRateXcd();
  const monthly = input.monthlyRateXcd ?? defaultMonthly;
  const useCustom = input.useCustomPricing === true || !isCatalogRateTier(monthly);

  const options: { durationMonths: number; label: string; usesCatalogPrice: boolean }[] = [];
  for (const p of plans) {
    const hasCatalog =
      !useCustom && (await resolveCatalogStripePriceId(monthly, p.durationMonths));
    options.push({
      durationMonths: p.durationMonths,
      label: formatPlanTerm(p.durationMonths),
      usesCatalogPrice: Boolean(hasCatalog),
    });
  }
  return options;
}

export function monthlyRateFromCustomer(
  stripeMonthlyRateXcd: Prisma.Decimal | null | undefined,
): number | null {
  if (stripeMonthlyRateXcd == null) return null;
  const n = Number(stripeMonthlyRateXcd);
  return Number.isFinite(n) && n > 0 ? normalizeRateXcd(n) : null;
}

/** Effective monthly rate for checkout from admin rate preset. */
export function effectiveMonthlyRateForCheckout(
  preset: string,
  customMonthlyRateXcd: number | null,
  defaultMonthlyRateXcd: number,
): { monthlyRateXcd: number | null; useCustomPricing: boolean } {
  if (preset === "custom") {
    return { monthlyRateXcd: customMonthlyRateXcd, useCustomPricing: true };
  }
  if (preset === "default" || !preset) {
    return { monthlyRateXcd: null, useCustomPricing: false };
  }
  const parsed = parseMonthlyRateXcd(preset);
  if (parsed == null) {
    return { monthlyRateXcd: null, useCustomPricing: false };
  }
  return {
    monthlyRateXcd: parsed,
    useCustomPricing: !isCatalogRateTier(parsed),
  };
}
