import { SubscriptionBillingTab } from "@/components/admin/canonical-subscription/billing-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

export default async function CanonicalSubscriptionBillingPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionBillingTab subscription={subscription} permissions={permissions} />;
}
