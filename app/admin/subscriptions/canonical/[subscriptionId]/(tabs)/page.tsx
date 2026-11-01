import { SubscriptionOverviewTab } from "@/components/admin/canonical-subscription/overview-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ error?: string; pilot?: string }>;
};

export default async function CanonicalSubscriptionOverviewPage({ params, searchParams }: Props) {
  const [{ subscriptionId }, query] = await Promise.all([params, searchParams]);
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionOverviewTab subscription={subscription} permissions={permissions} error={query.error} pilot={query.pilot} />;
}
