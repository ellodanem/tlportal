import Link from "next/link";

import { CanonicalManualActivationForm } from "@/components/admin/canonical-subscription-activation-form";
import { cardClass, collectionLabel, displayDate, iso, nativeBillingReadinessIssues } from "@/components/admin/canonical-subscription/format";
import {
  subscriptionAdvancedPath,
  subscriptionBasePath,
} from "@/lib/domain/canonical-subscription-navigation";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

/**
 * Things that need a person's attention, shown above the services list: errors, collection and
 * authority warnings, and the activation checklist for a draft. Renders nothing when there is
 * nothing to say, so a healthy subscription goes straight to its services.
 */
export function SubscriptionNotices({
  subscription,
  permissions,
  error,
  pilot,
}: {
  subscription: SubscriptionDetail;
  permissions: SubscriptionPermissions;
  error?: string;
  pilot?: string;
}) {
  const base = subscriptionBasePath(subscription.id);
  const isActivationDraft = permissions.editable && subscription.controlMode === "canonical";
  const activeServices = subscription.items.filter((item) => !["ended", "canceled"].includes(item.status));
  const nextBillingDate = iso(subscription.nextBillingDate);

  const serviceDetailsReady = activeServices.length > 0 && activeServices.every((item) => item.rates.length > 0);
  const hardwareReady = activeServices.length > 0 && activeServices.every((item) => item.serviceAssignments.some((assignment) => assignment.endDate == null && assignment.status !== "cancelled"));
  const billingReady = Boolean(subscription.collectionMethod && subscription.nextBillingDate);
  const readinessComplete = serviceDetailsReady && hardwareReady && billingReady;
  const readinessItems = [
    { label: "Service details confirmed", detail: `${activeServices.length} billable service${activeServices.length === 1 ? "" : "s"} with current pricing`, complete: serviceDetailsReady },
    { label: "Hardware assigned", detail: hardwareReady ? "Every current service has an active device" : "Assign a device to every current service", complete: hardwareReady },
    { label: "Billing decision selected", detail: billingReady ? `${collectionLabel(subscription.collectionMethod)} · renews ${displayDate(subscription.nextBillingDate)}` : "Choose a collection method and renewal date", complete: billingReady },
  ];

  const issues = nativeBillingReadinessIssues(subscription);
  const uninvoicedAdjustments = activeServices.filter((item) => item.initialAdjustment && !item.initialAdjustment.invoice).length;

  return (
    <div className="flex flex-col gap-5 empty:hidden">
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null}
      {pilot === "shadow-created" ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">The source-controlled subscription was created. Review it on the Advanced page before any authority transfer.</p> : null}

      {subscription.summary?.attentionRequired ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"><span className="font-semibold">Review collection.</span> An open balance is beyond grace or a provider operation needs review. <Link href={`${base}/billing`} className="font-semibold underline">See invoices &amp; payments in Billing</Link>.</div>
      ) : null}
      {subscription.controlMode === "shadow" ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"><span className="font-semibold">Review source authority.</span> This record remains read-only until approved reconciliation or adoption.{permissions.advanced.stripeAdoption ? <> <Link href={subscriptionAdvancedPath(subscription.id)} className="font-semibold underline">Open adoption review</Link>.</> : null}</div>
      ) : null}
      {issues.length ? (
        <section role="region" aria-label="Billing readiness issues" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">Billing readiness issues ({issues.length})</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950 dark:text-amber-200">{issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>
          <p className="mt-2"><Link href={`${base}/billing`} className="font-semibold underline">Open billing &amp; renewal</Link></p>
        </section>
      ) : null}
      {uninvoicedAdjustments > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"><span className="font-semibold">{uninvoicedAdjustments} agreed partial-period charge{uninvoicedAdjustments === 1 ? " is" : "s are"} not invoiced.</span> Agreed amounts are not bills until an invoice is issued. <Link href={`${base}/billing`} className="font-semibold underline">Review in Billing</Link>.</div>
      ) : null}

      {isActivationDraft ? (
        <section aria-labelledby="readiness-heading" className={`${cardClass} p-5`}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold text-white ${readinessComplete ? "bg-emerald-700" : "bg-amber-600"}`}>{readinessComplete ? "✓" : "!"}</span>
            <div><h2 id="readiness-heading" className="text-lg font-semibold">Readiness checklist</h2><p className="mt-1 text-sm text-zinc-500">{readinessComplete ? "All required items are complete. You can now activate this subscription." : "Finish the remaining setup before activation."}</p></div>
          </div>
          <ul className="mt-5 grid gap-3">
            {readinessItems.map((item) => (
              <li key={item.label} className={`flex items-center gap-3 rounded-lg border p-4 ${item.complete ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"}`}>
                <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${item.complete ? "bg-emerald-700" : "bg-amber-600"}`}>{item.complete ? "✓" : "!"}</span>
                <span className="min-w-0 flex-1"><strong className="block text-sm">{item.label}</strong><span className="mt-0.5 block text-xs text-zinc-500">{item.detail}</span></span>
                <span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${item.complete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{item.complete ? "Complete" : "Required"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isActivationDraft ? (
        <section aria-labelledby="initial-billing-heading" className={`${cardClass} p-5`}>
          <div><h2 id="initial-billing-heading" className="text-lg font-semibold">Initial billing decision</h2><p className="mt-1 text-sm text-zinc-500">Choose how to handle the first service period, then complete the activation review.</p></div>
          {subscription.collectionMethod === "manual_invoice" ? (
            <CanonicalManualActivationForm subscriptionId={subscription.id} commercialStartDate={iso(subscription.commercialStartDate)} nextBillingDate={nextBillingDate} gracePeriodDays={subscription.gracePeriodDays} cycleTotal={subscription.summary?.recurringCycleTotal ?? null} serviceCount={subscription.items.length} billingIntervalMonths={subscription.billingIntervalMonths} />
          ) : (
            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100">Only the isolated test-provider Checkout workflow is available. Live Stripe remains default-deny.</p>
          )}
          <p className="mt-4 text-sm text-zinc-500">Need a different billing method? <Link href={`${base}/billing`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Change it in Billing</Link>.</p>
        </section>
      ) : null}
    </div>
  );
}
