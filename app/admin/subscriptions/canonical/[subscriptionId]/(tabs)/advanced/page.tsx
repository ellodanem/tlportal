import { redirect } from "next/navigation";

import { SubscriptionAdvancedTab } from "@/components/admin/canonical-subscription/advanced-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ error?: string; pilot?: string }>;
};

export default async function CanonicalSubscriptionAdvancedPage({ params, searchParams }: Props) {
  const [{ subscriptionId }, query] = await Promise.all([params, searchParams]);
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  // Nothing relevant for this subscription: the tab is hidden, so send the user to Overview.
  if (!permissions.advanced.any) redirect(subscriptionBasePath(subscription.id));
  return <SubscriptionAdvancedTab subscription={subscription} permissions={permissions} error={query.error} pilot={query.pilot} />;
}
