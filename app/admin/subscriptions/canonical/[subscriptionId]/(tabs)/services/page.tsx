import { SubscriptionServicesTab } from "@/components/admin/canonical-subscription/services-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ error?: string; pilot?: string; view?: string }>;
};

export default async function CanonicalSubscriptionServicesPage({ params, searchParams }: Props) {
  const [{ subscriptionId }, query] = await Promise.all([params, searchParams]);
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionServicesTab subscription={subscription} permissions={permissions} error={query.error} pilot={query.pilot} view={query.view} />;
}
