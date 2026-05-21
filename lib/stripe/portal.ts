import "server-only";

import { prisma } from "@/lib/db";

import { getAppBaseUrl } from "./app-url";
import { getStripeClient } from "./config";

export async function createStripeBillingPortalSession(customerId: string): Promise<{ url: string }> {
  const account = await prisma.billingAccount.findUnique({
    where: {
      customerId_provider: { customerId, provider: "stripe" },
    },
    select: { externalCustomerId: true },
  });
  if (!account?.externalCustomerId) {
    throw new Error("No Stripe customer linked yet. Start Checkout first.");
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: account.externalCustomerId,
    return_url: `${getAppBaseUrl()}/admin/customers/${customerId}/edit`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a portal URL.");
  }

  return { url: session.url };
}
