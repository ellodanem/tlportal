import "server-only";

import type Stripe from "stripe";

import {
  CARD_ON_FILE_PROVIDER_MODE,
  isCardOnFileProviderMode,
} from "@/lib/domain/canonical-stripe-card-on-file";
import {
  cardOnFileMetadataFromStripe,
  completeCardOnFileCheckout,
  expireCardOnFileCheckout,
} from "@/lib/services/canonical-stripe-card-on-file-service";
import { getStripeClient } from "@/lib/stripe/config";

function sessionSubscriptionId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.subscription === "string") return session.subscription;
  return session.subscription?.id ?? null;
}

export async function tryHandleCardOnFileWebhookEvent(event: Stripe.Event): Promise<boolean> {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!isCardOnFileProviderMode(session.metadata?.tl_provider_mode)) return false;
    const meta = cardOnFileMetadataFromStripe(session.metadata);
    if (!meta.operationKey) return false;
    if (event.type === "checkout.session.expired") {
      await expireCardOnFileCheckout({ operationKey: meta.operationKey, checkoutSessionId: session.id });
      return true;
    }
    const subscriptionId = sessionSubscriptionId(session);
    if (!subscriptionId) return true;
    const stripeSubscription = await getStripeClient().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
    await completeCardOnFileCheckout({
      operationKey: meta.operationKey,
      checkoutSessionId: session.id,
      stripeSubscription,
    });
    return true;
  }

  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    if (!isCardOnFileProviderMode(subscription.metadata?.tl_provider_mode)) return false;
    const meta = cardOnFileMetadataFromStripe(subscription.metadata);
    if (!meta.operationKey) return false;
    const expanded = await getStripeClient().subscriptions.retrieve(subscription.id, { expand: ["items.data.price"] });
    await completeCardOnFileCheckout({
      operationKey: meta.operationKey,
      checkoutSessionId: "",
      stripeSubscription: expanded,
    });
    return true;
  }

  return false;
}

export function cardOnFileProviderMode(): string {
  return CARD_ON_FILE_PROVIDER_MODE;
}
