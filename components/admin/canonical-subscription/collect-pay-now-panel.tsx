import { CollectPayNowControls } from "@/components/admin/canonical-subscription/collect-pay-now";
import { shouldShowCardOnFilePanel } from "@/components/admin/canonical-subscription/collect-card-on-file-panel";
import { listOpenInvoicesForPayNow } from "@/lib/services/canonical-collection-program-service";
import { inspectStripeCardOnFileReadiness } from "@/lib/services/canonical-stripe-card-on-file-service";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

export async function CollectPayNowPanel({
  subscription,
  permissions,
}: {
  subscription: SubscriptionDetail;
  permissions: SubscriptionPermissions;
}) {
  if (!shouldShowCardOnFilePanel(subscription, permissions)) return null;
  try {
    const [state, openInvoices] = await Promise.all([
      inspectStripeCardOnFileReadiness(subscription.id, "pay_now"),
      listOpenInvoicesForPayNow(subscription.id),
    ]);
    return <CollectPayNowControls subscriptionId={subscription.id} state={state} openInvoices={openInvoices} />;
  } catch (error) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Pay-now Checkout could not be checked: {error instanceof Error ? error.message : "try again in a moment."}
      </div>
    );
  }
}
