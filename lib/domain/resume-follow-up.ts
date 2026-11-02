import { subscriptionAddServicePath, subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";

export type ResumeFollowUp = { text: string; href: string; linkLabel: string };

export type ResumeFollowUpSubscription = { id: string; collectionMethod: string | null };

/**
 * What staff must do after resuming a device so billing catches up. Resume itself only
 * reactivates the assignment: it never adds a subscription service or changes Stripe.
 */
export function resumeFollowUp(input: {
  customerId: string;
  billingMode: string;
  assignmentLinked: boolean;
  /** Open canonical subscriptions for the customer. */
  canonicalSubscriptions: ResumeFollowUpSubscription[];
}): ResumeFollowUp | null {
  const { customerId, billingMode, assignmentLinked, canonicalSubscriptions } = input;
  const cardBilled = billingMode === "stripe_subscription"
    || canonicalSubscriptions.some((subscription) => subscription.collectionMethod === "stripe_autocharge");

  if (!assignmentLinked && canonicalSubscriptions.length > 0) {
    const stripeStep = cardBilled ? " Then update the Stripe vehicle quantity from the subscription page." : "";
    const only = canonicalSubscriptions.length === 1 ? canonicalSubscriptions[0] : null;
    return {
      text: `This device is not a service on the customer’s subscription, so it will not be billed. Add it as a service and choose this existing assignment.${stripeStep}`,
      href: only ? subscriptionAddServicePath(only.id) : `/admin/customers/${customerId}/subscriptions`,
      linkLabel: only ? "Add to subscription" : "Choose a subscription",
    };
  }

  if (!cardBilled) return null;
  const stripeSubscriptions = canonicalSubscriptions.filter((subscription) => subscription.collectionMethod === "stripe_autocharge");
  return {
    text: "Stripe still bills the vehicle quantity from before the resume. Review and update it before the next charge.",
    href: stripeSubscriptions.length === 1 ? subscriptionBasePath(stripeSubscriptions[0].id) : `/admin/subscriptions/${customerId}/renewals`,
    linkLabel: "Update Stripe quantity",
  };
}
