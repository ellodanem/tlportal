import type { CustomerBillingMode } from "@prisma/client";

export type { CustomerBillingMode };

export const CUSTOMER_BILLING_MODE_LABEL: Record<CustomerBillingMode, string> = {
  manual_legacy: "Manual / Invoiless",
  stripe_subscription: "Stripe subscription",
};
