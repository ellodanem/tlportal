import { activateManualPilotLocallyAction } from "@/app/admin/subscriptions/canonical/pilot/actions";
import { cardClass, displayDate, money } from "@/components/admin/canonical-subscription/format";
import { CanonicalStripeAdoptionForm } from "@/components/admin/canonical-stripe-adoption-form";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";
import { canonicalProviderStatusLabel, canonicalSubscriptionUiEnabled } from "@/lib/domain/canonical-subscription-admin";

function localPilotActivationAvailable(subscription: SubscriptionDetail) {
  return canonicalSubscriptionUiEnabled()
    && process.env.CANONICAL_MANUAL_PILOT_ENABLED === "true"
    && process.env.CANONICAL_MANUAL_PILOT_CUSTOMER_ID === subscription.customerId
    && process.env.CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID === subscription.id
    && Boolean(process.env.CANONICAL_MANUAL_PILOT_APPROVAL_SECRET);
}

const PILOT_CONFIRMATIONS: readonly [string, string][] = [
  ["confirmCustomer", "Customer identity confirmed"],
  ["confirmTerms", "Commercial terms confirmed"],
  ["confirmBalances", "Historical balances reconciled"],
  ["confirmLegacyStop", "Exact legacy schedule will stop"],
  ["confirmCanonicalStart", "Subscription schedule will start"],
  ["confirmRecovery", "Recovery procedure reviewed"],
];

/**
 * Staff-only provider, Stripe adoption and manual-pilot pages. Each section renders only when it is
 * relevant to this subscription, and everything is visible: nothing here is collapsed.
 */
export function SubscriptionAdvancedTab({ subscription, permissions, error, pilot }: {
  subscription: SubscriptionDetail;
  permissions: SubscriptionPermissions;
  error?: string;
  pilot?: string;
}) {
  const sections = permissions.advanced;
  const review = subscription.manualPilotReview;

  return (
    <div className="flex flex-col gap-5">
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null}
      {pilot === "activated" ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">The test billing transition completed. The prior schedule stopped for the exact source arrangement, and this subscription now owns future billing.</p> : null}

      {sections.provider ? (
        <section aria-labelledby="provider-heading" className={`${cardClass} p-5`}>
          <h2 id="provider-heading" className="text-lg font-semibold">Provider relationship and operations <span className="ml-1 text-sm font-normal text-zinc-500">{canonicalProviderStatusLabel(subscription.providerStatus)}</span></h2>
          <p className="mt-2 text-sm text-zinc-500">Local relationship and operation history only. This does not claim live Stripe state.</p>
          <div className="mt-4 space-y-2">
            {subscription.providerLinks.length ? subscription.providerLinks.map((link) => (
              <div key={link.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
                <div className="flex flex-col justify-between gap-1 sm:flex-row"><span className="font-medium break-all">{String(link.provider).toUpperCase()} · {link.externalSubscriptionId}</span><span className="capitalize text-zinc-500">{link.providerStatus || "status not recorded"}{link.endedAt ? " · ended" : " · open"}</span></div>
                {link.lastError ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{link.lastError}</p> : null}
              </div>
            )) : <p className="text-sm text-zinc-500">No provider relationship is recorded.</p>}
            {subscription.billingOperations.map((operation) => (
              <div key={operation.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
                <div className="flex justify-between gap-3"><span className="font-medium capitalize">{String(operation.type).replaceAll("_", " ")}</span><span className="capitalize text-zinc-500">{String(operation.status).replaceAll("_", " ")}</span></div>
                {operation.failureMessage ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{operation.failureMessage}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sections.stripeAdoption ? (
        <section aria-labelledby="adoption-heading" className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900 dark:bg-blue-950/20">
          <h2 id="adoption-heading" className="text-lg font-semibold">Stripe adoption review</h2>
          <div className="mt-4"><CanonicalStripeAdoptionForm subscriptionId={subscription.id} serviceCount={subscription.items.length} cycleTotal={subscription.summary?.recurringCycleTotal ?? null} nextBillingDate={displayDate(subscription.nextBillingDate)} /></div>
        </section>
      ) : null}

      {sections.pilotTransfer ? (
        <section aria-labelledby="pilot-heading" className="rounded-xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
          <h2 id="pilot-heading" className="text-lg font-semibold">Manual pilot authority transfer</h2>
          {review ? (
            <>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-zinc-500">Billing source</dt><dd className="mt-1 font-medium capitalize">{review.proposal.sourceKind.replaceAll("_", " ")}</dd></div>
                <div><dt className="text-zinc-500">Cutover period</dt><dd className="mt-1 font-medium">{review.proposal.cutoverPeriodStart}</dd></div>
                <div><dt className="text-zinc-500">Approved recurring total</dt><dd className="mt-1 font-medium">{money(review.proposal.recurringAmount, review.proposal.currency)}</dd></div>
                <div><dt className="text-zinc-500">Historical outstanding</dt><dd className="mt-1 font-medium">{money(review.proposal.outstandingBalance, review.proposal.currency)}</dd></div>
              </dl>
              {localPilotActivationAvailable(subscription) ? (
                <form action={activateManualPilotLocallyAction} className="mt-5 space-y-3 rounded-lg border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-zinc-900">
                  <input type="hidden" name="subscriptionId" value={subscription.id} />
                  <label className="block text-sm font-medium">Synthetic approval reason<textarea required name="approvalReason" rows={3} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">{PILOT_CONFIRMATIONS.map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1" /><span>{label}</span></label>)}</div>
                  <button className="min-h-11 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Activate synthetic manual pilot</button>
                </form>
              ) : <p className="mt-4 text-xs text-zinc-500">Production cutover controls remain unavailable without the separately approved pilot configuration.</p>}
            </>
          ) : <p className="mt-4 text-sm text-zinc-500">{subscription.manualPilotReviewError ?? "Pilot readiness is unavailable."}</p>}
        </section>
      ) : null}
    </div>
  );
}
