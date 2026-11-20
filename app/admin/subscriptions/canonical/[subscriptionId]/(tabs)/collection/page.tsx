import { SubscriptionCollectionTab } from "@/components/admin/canonical-subscription/collection-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = {
  params: Promise<{ subscriptionId: string }>;
};

export default async function CanonicalSubscriptionCollectionPage({ params }: Props) {
  const { subscriptionId } = await params;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionCollectionTab subscription={subscription} permissions={permissions} />;
}
