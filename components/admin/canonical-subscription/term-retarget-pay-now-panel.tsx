import { TermRetargetPayNowForm } from "@/components/admin/canonical-subscription/term-retarget-pay-now";
import { termRetargetBlockers } from "@/lib/domain/canonical-term-retarget";
import { inspectTermRetargetReadiness } from "@/lib/services/canonical-term-retarget-service";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

export function shouldShowTermRetargetPanel(
  subscription: SubscriptionDetail,
  permissions: SubscriptionPermissions,
): boolean {
  if (!permissions.canManage || subscription.controlMode !== "canonical") return false;
  if (!["pending_activation", "active"].includes(subscription.lifecycleStatus ?? "")) return false;
  if (subscription.collectionMethod !== "manual_invoice") return false;
  if (subscription.providerLinks.some((link) => link.provider === "stripe" && link.endedAt == null)) return false;
  return subscription.items.some((item) => !["ended", "canceled"].includes(item.status));
}

export async function TermRetargetPayNowPanel({
  subscription,
  permissions,
}: {
  subscription: SubscriptionDetail;
  permissions: SubscriptionPermissions;
}) {
  if (!shouldShowTermRetargetPanel(subscription, permissions)) return null;
  try {
    const state = await inspectTermRetargetReadiness(subscription.id);
    if (!state.snapshot || !state.defaultTargetIntervalMonths || !state.snapshot.billingIntervalMonths) return null;
    const blockers = state.blockers.length ? state.blockers : termRetargetBlockers(state.snapshot, state.defaultTargetIntervalMonths);
    if (blockers.length) {
      return (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-semibold">Change term and pay by card</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
            {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      );
    }
    return (
      <TermRetargetPayNowForm
        subscriptionId={subscription.id}
        currentIntervalMonths={state.snapshot.billingIntervalMonths}
        currency={state.snapshot.currency ?? "XCD"}
        defaultTargetIntervalMonths={state.defaultTargetIntervalMonths}
        services={state.services}
        openInvoices={state.snapshot.openInvoices}
        leftoverSummary={state.leftover?.leftoverSummary ?? null}
        requiresExplicitCancel={state.leftover?.requiresExplicitCancel ?? false}
        liveSubscriptions={state.leftover?.liveSubscriptions ?? []}
      />
    );
  } catch (error) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        A term change could not be checked: {error instanceof Error ? error.message : "try again in a moment."}
      </div>
    );
  }
}
