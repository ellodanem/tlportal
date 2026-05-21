import "server-only";

import { Prisma } from "@prisma/client";

import { CATALOG_RATE_TIERS_XCD } from "@/lib/domain/billing-catalog";
import { prisma } from "@/lib/db";

const PLAN_MONTHS = [1, 3, 6, 12] as const;

/** Ensure rows exist for each catalog tier × term (idempotent). */
export async function ensureSubscriptionCatalogRows(): Promise<void> {
  for (const rate of CATALOG_RATE_TIERS_XCD) {
    for (const months of PLAN_MONTHS) {
      await prisma.subscriptionCatalogPrice.upsert({
        where: {
          monthlyRateXcd_durationMonths: {
            monthlyRateXcd: new Prisma.Decimal(rate),
            durationMonths: months,
          },
        },
        create: {
          monthlyRateXcd: new Prisma.Decimal(rate),
          durationMonths: months,
          isActive: true,
        },
        update: {},
      });
    }
  }
}
