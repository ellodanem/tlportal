import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { billableAssignmentWhere } from "@/lib/domain/service-assignment-queries";
import { formatXcd } from "@/lib/subscription-options/display";
import { periodTotalPerVehicleXcd } from "@/lib/domain/subscription-mrr";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { getStripeClient, isStripeBillingEnabled } from "@/lib/stripe/config";
import { syncStripeSubscriptionToDatabase } from "@/lib/stripe/subscription-sync";
import { parseStripeBillingMetadata } from "@/lib/stripe/metadata";

export type StripeSubscriptionSyncState = "in_sync" | "differs" | "unavailable";

/** Serializable view for the Billing status strip. */
export type StripeSubscriptionSyncView = {
  state: StripeSubscriptionSyncState;
  reason: string | null;
  canPush: boolean;
  tlVehicleCount: number;
  stripeQuantity: number | null;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
  periodEndLabel: string | null;
  /** Expected next period charge at TL vehicle count (from TL rate × term). */
  tlNextChargeLabel: string | null;
  /** Expected next period charge at current Stripe quantity. */
  stripeNextChargeLabel: string | null;
};

const PUSHABLE_STATUSES = new Set(["active", "trialing"]);

function formatPeriodEnd(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function chargeLabel(monthlyRateXcd: number | null, planTermMonths: number, vehicles: number): string | null {
  if (monthlyRateXcd == null || !(monthlyRateXcd > 0) || vehicles < 1) return null;
  const perVehicle = periodTotalPerVehicleXcd(monthlyRateXcd, planTermMonths);
  const total = Math.round(perVehicle * vehicles * 100) / 100;
  return formatXcd(total);
}

async function countActiveAssignments(customerId: string): Promise<number> {
  const n = await prisma.serviceAssignment.count({
    where: { customerId, ...billableAssignmentWhere },
  });
  return Math.max(1, n);
}

async function resolveLinkedStripeSubscriptionId(customerId: string): Promise<string | null> {
  const withStripeId = await prisma.customerSubscription.findFirst({
    where: {
      customerId,
      stripeSubscriptionId: { not: null },
      status: { in: ["active", "trialing", "past_due", "unpaid", "pending_payment"] },
    },
    orderBy: { updatedAt: "desc" },
    select: { stripeSubscriptionId: true },
  });
  if (withStripeId?.stripeSubscriptionId) {
    return withStripeId.stripeSubscriptionId;
  }

  const account = await prisma.billingAccount.findUnique({
    where: { customerId_provider: { customerId, provider: "stripe" } },
    select: { metadata: true },
  });
  const meta = parseStripeBillingMetadata(account?.metadata);
  return meta?.subscriptionId?.trim() || null;
}

function unavailable(
  partial: Partial<StripeSubscriptionSyncView> & { reason: string },
): StripeSubscriptionSyncView {
  return {
    state: "unavailable",
    canPush: false,
    tlVehicleCount: partial.tlVehicleCount ?? 1,
    stripeQuantity: partial.stripeQuantity ?? null,
    stripeSubscriptionId: partial.stripeSubscriptionId ?? null,
    stripeStatus: partial.stripeStatus ?? null,
    periodEndLabel: partial.periodEndLabel ?? null,
    tlNextChargeLabel: partial.tlNextChargeLabel ?? null,
    stripeNextChargeLabel: partial.stripeNextChargeLabel ?? null,
    reason: partial.reason,
  };
}

/**
 * Compare TL fleet vehicle count (active assignments) to Stripe subscription quantity.
 * Rate / next charge are read-only context for the UI.
 */
export async function compareTlStripeSubscription(
  customerId: string,
): Promise<StripeSubscriptionSyncView> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      billingMode: true,
      stripeMonthlyRateXcd: true,
    },
  });
  if (!customer) {
    return unavailable({ reason: "Customer not found." });
  }
  if (customer.billingMode !== "stripe_subscription") {
    return unavailable({ reason: "Customer is not on Stripe card billing." });
  }
  if (!isStripeBillingEnabled()) {
    return unavailable({ reason: "Stripe billing is not configured." });
  }

  const tlVehicleCount = await countActiveAssignments(customerId);
  const stripeSubscriptionId = await resolveLinkedStripeSubscriptionId(customerId);
  if (!stripeSubscriptionId) {
    return unavailable({
      tlVehicleCount,
      reason: "No Stripe subscription linked yet. Send a payment link first.",
    });
  }

  const tlSub = await prisma.customerSubscription.findFirst({
    where: { customerId, stripeSubscriptionId },
    orderBy: { updatedAt: "desc" },
    select: {
      monthlyRateXcd: true,
      planTermMonths: true,
      currentPeriodEnd: true,
      status: true,
    },
  });

  const monthlyRate =
    tlSub?.monthlyRateXcd != null
      ? Number(tlSub.monthlyRateXcd)
      : customer.stripeMonthlyRateXcd != null
        ? Number(customer.stripeMonthlyRateXcd)
        : null;
  const planTermMonths = tlSub?.planTermMonths ?? 1;
  const periodEndLabel = formatPeriodEnd(tlSub?.currentPeriodEnd);

  let sub: Stripe.Subscription;
  try {
    const stripe = getStripeClient();
    sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (e) {
    return unavailable({
      tlVehicleCount,
      stripeSubscriptionId,
      periodEndLabel,
      reason: e instanceof Error ? e.message : "Could not load Stripe subscription.",
    });
  }

  if (sub.items.data.length === 0) {
    return unavailable({
      tlVehicleCount,
      stripeSubscriptionId,
      stripeStatus: sub.status,
      periodEndLabel: formatPeriodEnd(
        sub.current_period_end != null ? new Date(sub.current_period_end * 1000) : tlSub?.currentPeriodEnd,
      ),
      reason: "Stripe subscription has no line items.",
    });
  }
  if (sub.items.data.length > 1) {
    return unavailable({
      tlVehicleCount,
      stripeSubscriptionId,
      stripeStatus: sub.status,
      periodEndLabel: formatPeriodEnd(
        sub.current_period_end != null ? new Date(sub.current_period_end * 1000) : tlSub?.currentPeriodEnd,
      ),
      reason: "Multi-item Stripe subscriptions cannot be synced from TL yet.",
    });
  }

  const stripeQuantity = Math.max(0, Math.trunc(sub.items.data[0]?.quantity ?? 0));
  const resolvedPeriodEnd =
    sub.current_period_end != null
      ? new Date(sub.current_period_end * 1000)
      : tlSub?.currentPeriodEnd ?? null;
  const resolvedPeriodLabel = formatPeriodEnd(resolvedPeriodEnd);

  const tlNextChargeLabel = chargeLabel(monthlyRate, planTermMonths, tlVehicleCount);
  const stripeNextChargeLabel = chargeLabel(monthlyRate, planTermMonths, Math.max(1, stripeQuantity));

  if (!PUSHABLE_STATUSES.has(sub.status)) {
    return unavailable({
      tlVehicleCount,
      stripeQuantity,
      stripeSubscriptionId,
      stripeStatus: sub.status,
      periodEndLabel: resolvedPeriodLabel,
      tlNextChargeLabel,
      stripeNextChargeLabel,
      reason: `Stripe subscription status is “${sub.status}” — only active or trialing can be updated.`,
    });
  }

  const state: StripeSubscriptionSyncState =
    stripeQuantity === tlVehicleCount ? "in_sync" : "differs";

  return {
    state,
    reason:
      state === "differs"
        ? `TL has ${tlVehicleCount} active vehicle${tlVehicleCount === 1 ? "" : "s"}; Stripe bills ${stripeQuantity}.`
        : null,
    canPush: state === "differs",
    tlVehicleCount,
    stripeQuantity,
    stripeSubscriptionId,
    stripeStatus: sub.status,
    periodEndLabel: resolvedPeriodLabel,
    tlNextChargeLabel,
    stripeNextChargeLabel,
  };
}

/**
 * Push TL active-assignment vehicle count to Stripe subscription quantity.
 * Uses proration_behavior: none (applies on next invoice). Updates metadata.tl_vehicle_count
 * so Stripe→TL webhooks do not overwrite with a stale count.
 */
export async function pushTlVehicleCountToStripe(input: {
  customerId: string;
  actorUserId?: string | null;
}): Promise<
  | { ok: true; previousQuantity: number; newQuantity: number; stripeSubscriptionId: string }
  | { ok: false; error: string }
> {
  const compare = await compareTlStripeSubscription(input.customerId);
  if (!compare.canPush || !compare.stripeSubscriptionId || compare.stripeQuantity == null) {
    return {
      ok: false,
      error: compare.reason ?? "Nothing to push to Stripe.",
    };
  }

  const stripe = getStripeClient();
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(compare.stripeSubscriptionId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load Stripe subscription." };
  }

  if (sub.items.data.length !== 1) {
    return { ok: false, error: "Stripe subscription must have exactly one line item." };
  }
  if (!PUSHABLE_STATUSES.has(sub.status)) {
    return { ok: false, error: `Cannot update a “${sub.status}” subscription.` };
  }

  const item = sub.items.data[0];
  if (!item?.id) {
    return { ok: false, error: "Stripe subscription item is missing." };
  }

  const previousQuantity = Math.trunc(item.quantity ?? 0);
  const newQuantity = compare.tlVehicleCount;
  if (previousQuantity === newQuantity) {
    return { ok: false, error: "Stripe quantity already matches TL." };
  }

  let updated: Stripe.Subscription;
  try {
    updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity: newQuantity }],
      proration_behavior: "none",
      metadata: {
        ...sub.metadata,
        tl_vehicle_count: String(newQuantity),
        tl_customer_id: sub.metadata?.tl_customer_id || input.customerId,
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe update failed." };
  }

  try {
    await syncStripeSubscriptionToDatabase(updated);
  } catch (e) {
    console.error("[stripe-subscription-sync] post-push TL sync failed", e);
  }

  await recordOperationalEvent({
    category: "billing.synced",
    summary: `Stripe quantity updated ${previousQuantity} → ${newQuantity} (no proration)`,
    customerId: input.customerId,
    actorUserId: input.actorUserId ?? undefined,
    payload: {
      provider: "stripe",
      stripeSubscriptionId: updated.id,
      previousQuantity,
      newQuantity,
      prorationBehavior: "none",
    },
  });

  return {
    ok: true,
    previousQuantity,
    newQuantity,
    stripeSubscriptionId: updated.id,
  };
}
