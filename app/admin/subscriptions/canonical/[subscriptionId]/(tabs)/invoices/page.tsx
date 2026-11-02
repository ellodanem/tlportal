import { redirect } from "next/navigation";

import { subscriptionBillingPath } from "@/lib/domain/canonical-subscription-navigation";

/** Invoices and payments now live on the Billing tab. Old links and bookmarks land there. */
export default async function CanonicalSubscriptionInvoicesRedirect({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  redirect(subscriptionBillingPath(subscriptionId));
}
