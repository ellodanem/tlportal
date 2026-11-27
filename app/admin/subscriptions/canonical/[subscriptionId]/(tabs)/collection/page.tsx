import { SubscriptionCollectionTab } from "@/components/admin/canonical-subscription/collection-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ term?: string }>;
};

export default async function CanonicalSubscriptionCollectionPage({ params, searchParams }: Props) {
  const { subscriptionId } = await params;
  const { term } = await searchParams;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionCollectionTab subscription={subscription} permissions={permissions} termNotice={term} />;
}
