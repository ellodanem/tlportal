"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import {
  finalizeCanaryCollection,
  revertCanaryCollectionToRecurringInvoices,
} from "@/lib/services/canonical-stripe-canary-collection-service";
import { startCanonicalStripeLiveCanaryFromOwner } from "@/lib/services/canonical-stripe-live-canary-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

import type { CanonicalSubscriptionFormState } from "./actions";

const CONFIRMATIONS = ["confirmCustomer", "confirmSubscription", "confirmCharge", "confirmMinimum", "confirmRenewal", "confirmCancel"] as const;

/**
 * Only the configured canary owner may drive the live canary. A signed-in staff member who is
 * not the owner is refused here, in addition to the canary's own environment and signature gates.
 */
async function requireCanaryOwner(subscriptionId: string) {
  if (!canonicalSubscriptionUiVisible()) throw new Error("Subscription tools are unavailable.");
  const session = await getSession();
  if (!session) throw new Error("You must be signed in.");
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, email: true } });
  const owner = process.env.CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL?.trim().toLowerCase();
  if (!user || !owner || user.email.trim().toLowerCase() !== owner) {
    throw new Error("Only the live-canary owner can do this.");
  }
  if (process.env.CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID?.trim() !== subscriptionId) {
    throw new Error("This subscription is not the allowlisted canary subscription.");
  }
  const subscription = await prisma.customerSubscription.findUnique({ where: { id: subscriptionId }, select: { customerId: true } });
  if (!subscription) throw new Error("Subscription not found.");
  return { userId: user.id, customerId: subscription.customerId };
}

function refresh(subscriptionId: string) {
  revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
  revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}/billing`);
  revalidatePath("/admin/subscriptions");
}

/** Switch to Stripe, sign, approve and create the one Checkout. Nothing is charged until the customer completes it. */
export async function startStripeCanaryAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  try {
    const actor = await requireCanaryOwner(subscriptionId);
    if (CONFIRMATIONS.some((name) => formData.get(name) !== "yes")) {
      return { error: "Tick every confirmation before continuing." };
    }
    if (String(formData.get("typed") ?? "").trim() !== "CREATE") {
      return { error: "Type CREATE to confirm." };
    }
    const result = await startCanonicalStripeLiveCanaryFromOwner({ subscriptionId });
    await recordOperationalEvent({
      category: "subscription.stripe_canary_started",
      summary: "Owner started the live Stripe canary from the Billing tab.",
      customerId: actor.customerId,
      actorUserId: actor.userId,
      payload: { subscriptionId, operationId: result.operationId, status: result.status },
    });
    refresh(subscriptionId);
    return { message: "The Stripe Checkout link is ready below. Send it to the customer. Nothing is charged until they complete it." };
  } catch (error) {
    refresh(subscriptionId);
    return { error: error instanceof Error ? error.message : "The live canary could not be started." };
  }
}

/** After the customer paid and Stripe is linked: end the paused recurring invoices. */
export async function finalizeStripeCanaryAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  try {
    const actor = await requireCanaryOwner(subscriptionId);
    const result = await finalizeCanaryCollection(subscriptionId);
    await recordOperationalEvent({
      category: "subscription.stripe_canary_finalized",
      summary: "Owner finalized the live Stripe canary.",
      customerId: actor.customerId,
      actorUserId: actor.userId,
      payload: { subscriptionId, endedScheduleCount: result.endedScheduleCount },
    });
    refresh(subscriptionId);
    return { message: `Done. ${result.endedScheduleCount} recurring invoice schedule${result.endedScheduleCount === 1 ? "" : "s"} ended.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not finalize." };
  }
}

/** Undo a half-finished attempt (switched, but nothing approved or sent). Refused once a Checkout exists. */
export async function undoStripeCanaryAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  try {
    await requireCanaryOwner(subscriptionId);
    const result = await revertCanaryCollectionToRecurringInvoices(subscriptionId);
    refresh(subscriptionId);
    return { message: `Back to recurring invoices. ${result.resumedScheduleIds.length} schedule${result.resumedScheduleIds.length === 1 ? "" : "s"} resumed.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not undo." };
  }
}
