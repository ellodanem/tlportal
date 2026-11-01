import { SubscriptionInvoicesTab } from "@/components/admin/canonical-subscription/invoices-tab";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

export default async function CanonicalSubscriptionInvoicesPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const { subscription } = await requireSubscriptionPage(subscriptionId);
  return <SubscriptionInvoicesTab subscription={subscription} />;
}
