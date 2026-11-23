import { CollectCardOnFilePanel } from "@/components/admin/canonical-subscription/collect-card-on-file-panel";
import { CollectPayNowPanel } from "@/components/admin/canonical-subscription/collect-pay-now-panel";
import {
  ArmCollectionProgramForm,
  CancelCollectionProgramForm,
} from "@/components/admin/canonical-subscription/collection-program-controls";
import { cardClass, displayDate } from "@/components/admin/canonical-subscription/format";
import { startOfUtcDay } from "@/lib/billing/recurring-period";
import { collectionCardLinkStartDate } from "@/lib/domain/canonical-collection-program";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

function openStripeLink(subscription: SubscriptionDetail) {
  return subscription.providerLinks.some((link) => link.provider === "stripe" && link.endedAt == null);
}

export async function SubscriptionCollectionTab({
  subscription,
  permissions,
}: {
  subscription: SubscriptionDetail;
  permissions: SubscriptionPermissions;
}) {
  const firstCharge = subscription.nextBillingDate;
  const cardLinkDate = firstCharge ? collectionCardLinkStartDate(firstCharge) : null;
  const program = subscription.collectionProgram;
  const linked = openStripeLink(subscription);
  const canSendCardOnFileNow = Boolean(
    firstCharge && startOfUtcDay(firstCharge).getTime() > startOfUtcDay(new Date()).getTime(),
  );

  return (
    <div className="flex flex-col gap-5">
      <section className={`${cardClass} p-5`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">When to ask for the card</h2>
        {linked ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">A card is on file. Stripe will charge this subscription automatically. Collection does not send more Checkout links.</p>
        ) : program?.status === "armed" ? (
          <div className="mt-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Program armed. Card-on-file Checkout starts {displayDate(cardLinkDate)}. Pay-now Checkout is sent on {displayDate(firstCharge)} if the card is still missing. Checkout links expire after 24 hours, so a fresh link is sent each day in that window.
            </p>
            {program.lastCheckoutUrl ? (
              <p className="mt-3 break-all text-sm">
                Latest link ({program.lastCheckoutKind === "pay_now" ? "pay now" : "card on file"}): {program.lastCheckoutUrl}
              </p>
            ) : null}
            {program.lastNotifySummary ? <p className="mt-2 text-xs text-zinc-500">{program.lastNotifySummary}</p> : null}
            {permissions.canManage ? <CancelCollectionProgramForm subscriptionId={subscription.id} /> : null}
          </div>
        ) : (
          <div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Pay now charges today and starts monthly card billing. Collect card, bill later saves a card now and charges on {displayDate(firstCharge)}.
              {subscription.collectionMethod === "stripe_autocharge"
                ? ` You can also arm Collection so the customer is asked three days before ${displayDate(firstCharge)}.`
                : " Pay now also switches this agreement off recurring invoices."}
            </p>
            {permissions.canManage && subscription.collectionMethod === "stripe_autocharge" && firstCharge && cardLinkDate ? (
              <ArmCollectionProgramForm
                subscriptionId={subscription.id}
                cardLinkDate={displayDate(cardLinkDate)}
                firstChargeDate={displayDate(firstCharge)}
              />
            ) : null}
            {permissions.canManage ? <CollectPayNowPanel subscription={subscription} permissions={permissions} /> : null}
            {permissions.canManage && canSendCardOnFileNow ? <CollectCardOnFilePanel subscription={subscription} permissions={permissions} /> : null}
          </div>
        )}
      </section>
    </div>
  );
}
