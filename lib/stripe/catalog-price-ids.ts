import "server-only";

import { Prisma } from "@prisma/client";

import { normalizeRateXcd } from "@/lib/domain/billing-catalog";
import { prisma } from "@/lib/db";

import { resolveStripePriceId } from "./price-ids";

const LEGACY_ENV_BY_MONTHS: Record<number, string> = {
  1: "STRIPE_PRICE_ID_1MO",
  3: "STRIPE_PRICE_ID_3MO",
  6: "STRIPE_PRICE_ID_6MO",
  12: "STRIPE_PRICE_ID_12MO",
};

function catalogEnvKey(monthlyRateXcd: number, durationMonths: number): string {
  const rate = Math.round(normalizeRateXcd(monthlyRateXcd));
  return `STRIPE_PRICE_${rate}_${durationMonths}MO`;
}

/**
 * Resolve Stripe Price id for catalog tier × term (per vehicle). DB → env → legacy $30 env.
 */
export async function resolveCatalogStripePriceId(
  monthlyRateXcd: number,
  durationMonths: number,
): Promise<string | null> {
  const rate = normalizeRateXcd(monthlyRateXcd);
  const months = Math.trunc(durationMonths);

  const row = await prisma.subscriptionCatalogPrice.findUnique({
    where: {
      monthlyRateXcd_durationMonths: {
        monthlyRateXcd: new Prisma.Decimal(rate),
        durationMonths: months,
      },
    },
    select: { stripePriceId: true, isActive: true },
  });
  if (row?.isActive && row.stripePriceId?.trim()) {
    return row.stripePriceId.trim();
  }

  const fromEnv = process.env[catalogEnvKey(rate, months)]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (rate === 30) {
    return resolveStripePriceId(months);
  }

  return null;
}

export { catalogEnvKey, LEGACY_ENV_BY_MONTHS };
