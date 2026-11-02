import Link from "next/link";

import { StripeSyncPanel } from "@/components/admin/stripe-sync-panel";
import type { SubscriptionDetail } from "@/lib/admin/canonical-subscription-page-data";
import {
  billableServiceCountAtRenewal,
  evaluateCanonicalStripeQuantity,
} from "@/lib/domain/canonical-stripe-quantity-check";
import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import { compareTlStripeSubscription } from "@/lib/services/stripe-subscription-sync-service";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Live read of the Stripe subscription quantity against this agreement's billable services.
 * Renders nothing for agreements that Stripe does not collect.
 */
export async function StripeQuantityCheck({ subscription, canManage }: { subscription: SubscriptionDetail; canManage: boolean }) {
  if (subscription.controlMode !== "canonical" || subscription.collectionMethod !== "stripe_autocharge") return null;
  if (!isStripeBillingEnabled()) return null;

  const serviceCount = billableServiceCountAtRenewal(subscription.items, subscription.nextBillingDate);
  const linked = subscription.providerLinks.find((link) => link.provider === "stripe" && link.endedAt == null);
  const sync = await compareTlStripeSubscription(subscription.customerId);
  const check = evaluateCanonicalStripeQuantity({
    serviceCount,
    linkedExternalSubscriptionId: linked?.externalSubscriptionId ?? null,
    sync,
  });
  // The quantity mismatch is reconciled on this subscription's own services, not on the legacy
  // customer-level renewals page.
  const servicesHref = `${subscriptionBasePath(subscription.id)}/services`;

  if (check.state === "in_sync") {
    // Healthy state: a quiet one-line indicator. Anything that needs action keeps the full warning below.
    return (
      <p role="status" className="-mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" />
        Stripe quantity in sync · {plural(check.serviceCount, "billable service")}
      </p>
    );
  }

  if (check.state === "unavailable") {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <span className="font-semibold">Stripe quantity not checked.</span> {check.reason}
      </p>
    );
  }

  if (check.pushMatchesServices && canManage) {
    return <StripeSyncPanel customerId={subscription.customerId} sync={sync} />;
  }

  return (
    <section role="alert" className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-semibold">Stripe will bill {plural(check.stripeQuantity, "vehicle")}, but this subscription has {plural(check.serviceCount, "billable service")}.</p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
        {check.deviceCount === check.serviceCount
          ? "Stripe can’t be updated from here right now."
          : `The customer has ${plural(check.deviceCount, "active device")} on this billing term, so the one-click update would set the wrong quantity. Reconcile the services and device assignments first.`}
        {sync.reason ? ` ${sync.reason}` : ""}
      </p>
      <Link href={servicesHref} className="mt-2 inline-block font-semibold text-emerald-700 underline dark:text-emerald-400">Review services on this subscription</Link>
    </section>
  );
}
