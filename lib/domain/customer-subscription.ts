import type { CustomerSubscriptionStatus } from "@prisma/client";

export type { CustomerSubscriptionStatus };

export const CUSTOMER_SUBSCRIPTION_STATUS_LABEL: Record<CustomerSubscriptionStatus, string> = {
  pending_payment: "Pending payment",
  active: "Active",
  past_due: "Past due",
  unpaid: "Unpaid",
  canceled: "Canceled",
  trialing: "Trialing",
  paused: "Paused",
};

/** Map Stripe subscription.status → TL subscription status. */
export function stripeSubscriptionStatusToTl(
  stripeStatus: string,
): CustomerSubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "paused";
    case "incomplete":
      return "pending_payment";
    default:
      return "pending_payment";
  }
}
