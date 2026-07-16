import "server-only";

import { randomBytes } from "crypto";

import { prisma } from "@/lib/db";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

import { CHECKOUT_RECOVERY_VALID_DAYS } from "./checkout-messaging";

export type CheckoutPaymentLinkPlanKeyInput = {
  durationMonths: number;
  vehicleCount: number;
  monthlyRateXcd: number | null;
  useCustomPricing: boolean;
};

export function checkoutPaymentPlanKey(input: CheckoutPaymentLinkPlanKeyInput): string {
  // Stable signature for a staff-selected plan configuration.
  // monthlyRateXcd can be null for "default catalog tier".
  return `d=${input.durationMonths}|v=${input.vehicleCount}|m=${input.monthlyRateXcd ?? "default"}|c=${
    input.useCustomPricing ? 1 : 0
  }`;
}

/** Short, URL-safe token for the `/pay/go/{token}` checkout redirect. */
export function newCheckoutPayLinkToken(): string {
  return randomBytes(9).toString("base64url");
}

export async function findLatestCheckoutPayLinkTokenForPlan(input: {
  customerId: string;
  planKey: string;
  withinDays?: number;
}): Promise<{ payLinkToken: string } | null> {
  const within = input.withinDays ?? CHECKOUT_RECOVERY_VALID_DAYS;
  const since = new Date(Date.now() - within * 24 * 60 * 60 * 1000);

  const row = await prisma.operationalEvent.findFirst({
    where: {
      customerId: input.customerId,
      category: "billing.checkout_payment_link",
      occurredAt: { gte: since },
      payload: { path: ["planKey"], equals: input.planKey },
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });

  const payLinkToken = (row?.payload as { payLinkToken?: unknown } | null)?.payLinkToken;
  if (typeof payLinkToken !== "string" || !payLinkToken.trim()) return null;
  return { payLinkToken };
}

export async function recordCheckoutPayLinkDestination(input: {
  customerId: string;
  actorUserId?: string | null;
  planKey: string;
  payLinkToken: string;
  checkoutSessionId: string;
  payUrl: string;
}): Promise<void> {
  await recordOperationalEvent({
    category: "billing.checkout_payment_link",
    summary: "Checkout pay link destination set",
    customerId: input.customerId,
    actorUserId: input.actorUserId ?? undefined,
    payload: {
      planKey: input.planKey,
      payLinkToken: input.payLinkToken,
      checkoutSessionId: input.checkoutSessionId,
      payUrl: input.payUrl,
    },
  });
}

