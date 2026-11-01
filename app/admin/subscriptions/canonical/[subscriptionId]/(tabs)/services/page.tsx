import { SubscriptionServicesTab } from "@/components/admin/canonical-subscription/services-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

export default async function CanonicalSubscriptionServicesPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionServicesTab subscription={subscription} permissions={permissions} />;
}
