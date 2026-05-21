import "server-only";

import { prisma } from "@/lib/db";

const ENV_BY_MONTHS: Record<number, string> = {
  1: "STRIPE_PRICE_ID_1MO",
  3: "STRIPE_PRICE_ID_3MO",
  6: "STRIPE_PRICE_ID_6MO",
  12: "STRIPE_PRICE_ID_12MO",
};

export async function resolveStripePriceId(durationMonths: number): Promise<string | null> {
  const plan = await prisma.subscriptionOption.findUnique({
    where: { durationMonths },
    select: { stripePriceId: true, isActive: true },
  });
  if (plan?.stripePriceId?.trim()) {
    return plan.stripePriceId.trim();
  }
  const envKey = ENV_BY_MONTHS[durationMonths];
  if (!envKey) {
    return null;
  }
  const fromEnv = process.env[envKey]?.trim();
  return fromEnv || null;
}
