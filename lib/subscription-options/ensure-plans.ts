import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { SUBSCRIPTION_PLAN_MONTHS } from "./display";

const DEFAULT_PRICE_XCD: Record<(typeof SUBSCRIPTION_PLAN_MONTHS)[number], number> = {
  1: 30,
  3: 90,
  6: 180,
  12: 330,
};

/** Ensures exactly the four standard tiers exist (e.g. after deploy or migration). */
export async function ensureSubscriptionPlanRows(): Promise<void> {
  for (const months of SUBSCRIPTION_PLAN_MONTHS) {
    const existing = await prisma.subscriptionOption.findUnique({
      where: { durationMonths: months },
      select: { id: true },
    });
    if (!existing) {
      await prisma.subscriptionOption.create({
        data: {
          durationMonths: months,
          priceXcd: new Prisma.Decimal(DEFAULT_PRICE_XCD[months]),
          isActive: true,
        },
      });
    }
  }
}
