import { parseLedgerFilter, SubscriptionBillingTab } from "@/components/admin/canonical-subscription/billing-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ show?: string }>;
};

export default async function CanonicalSubscriptionBillingPage({ params, searchParams }: Props) {
  const { subscriptionId } = await params;
  const { show } = await searchParams;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionBillingTab subscription={subscription} permissions={permissions} filter={parseLedgerFilter(show)} />;
}
