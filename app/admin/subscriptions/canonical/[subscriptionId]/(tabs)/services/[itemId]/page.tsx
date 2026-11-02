import { notFound } from "next/navigation";

import { SubscriptionServiceDetails } from "@/components/admin/canonical-subscription/service-details";
import { loadManageableServiceOperationTargets, loadServiceHistory, requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = { params: Promise<{ subscriptionId: string; itemId: string }> };

export default async function CanonicalServiceDetailsPage({ params }: Props) {
  const { subscriptionId, itemId } = await params;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  // The item must belong to this subscription; a service id from another agreement is never shown here.
  const item = subscription.items.find((candidate) => candidate.id === itemId);
  if (!item) notFound();
  const [{ transferTargets, replacementAssignments }, history] = await Promise.all([
    loadManageableServiceOperationTargets(subscription, permissions.canManage),
    loadServiceHistory(item),
  ]);
  return <SubscriptionServiceDetails subscription={subscription} item={item} permissions={permissions} replacementAssignments={replacementAssignments} transferTargets={transferTargets} history={history} />;
}
