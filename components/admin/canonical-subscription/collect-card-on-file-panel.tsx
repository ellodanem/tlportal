import { CollectCardOnFileControls } from "@/components/admin/canonical-subscription/collect-card-on-file";
import { inspectStripeCardOnFileReadiness } from "@/lib/services/canonical-stripe-card-on-file-service";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

export function shouldShowCardOnFilePanel(subscription: SubscriptionDetail, permissions: SubscriptionPermissions): boolean {
  if (!permissions.canManage || subscription.controlMode !== "canonical") return false;
  if (!["draft", "pending_activation", "active"].includes(subscription.lifecycleStatus ?? "")) return false;
  return !subscription.providerLinks.some((link) => link.provider === "stripe" && link.endedAt == null);
}

export async function CollectCardOnFilePanel({
  subscription,
  permissions,
}: {
  subscription: SubscriptionDetail;
  permissions: SubscriptionPermissions;
}) {
  if (!shouldShowCardOnFilePanel(subscription, permissions)) return null;
  try {
    const state = await inspectStripeCardOnFileReadiness(subscription.id);
    return <CollectCardOnFileControls subscriptionId={subscription.id} state={state} />;
  } catch (error) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Stripe card collection could not be checked: {error instanceof Error ? error.message : "try again in a moment."}
      </div>
    );
  }
}
