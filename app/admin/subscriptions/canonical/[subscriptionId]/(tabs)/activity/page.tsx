import { SubscriptionActivityTab } from "@/components/admin/canonical-subscription/activity-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

export default async function CanonicalSubscriptionActivityPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const { subscription } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionActivityTab subscription={subscription} />;
}
