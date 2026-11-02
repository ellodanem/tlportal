import Link from "next/link";

import {
  adjustmentMethodLabel,
  cardClass,
  collectionLabel,
  displayDate,
  money,
  nativeBillingReadinessIssues,
} from "@/components/admin/canonical-subscription/format";
import { CanonicalSubscriptionCollectionForm } from "@/components/admin/canonical-subscription-collection-form";
import { SubscriptionAdjustmentInvoiceForm } from "@/components/admin/subscription-adjustment-invoice-form";
import { canonicalAnnualAdjustmentExecutionEnabled } from "@/lib/domain/canonical-annual-adjustment";
import { subscriptionAnnualAdjustmentPath } from "@/lib/domain/canonical-subscription-navigation";
import { cycleUnitLabel } from "@/lib/domain/subscription-proration";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

export function SubscriptionBillingTab({ subscription, permissions }: { subscription: SubscriptionDetail; permissions: SubscriptionPermissions }) {
  const currency = subscription.currency ?? "XCD";
  const activeServices = subscription.items.filter((item) => !["ended", "canceled"].includes(item.status));
  const adjustmentRows = activeServices.flatMap((item) => item.initialAdjustment
    ? [{ item, adjustment: item.initialAdjustment, status: subscription.adjustmentStatuses.find((entry) => entry.itemId === item.id) ?? null }]
    : []);
  const adjustmentExecutionEnabled = canonicalAnnualAdjustmentExecutionEnabled();
  const issues = nativeBillingReadinessIssues(subscription);
  const schedules = subscription.recurringSchedules;
  const showAnnualAdjustment = subscription.billingIntervalMonths === 12 && subscription.controlMode !== "legacy";

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="renewal-heading" className={`${cardClass} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="renewal-heading" className="text-lg font-semibold">Billing &amp; renewal</h2>
            <p className="mt-1 text-sm text-zinc-500">Cycle totals come from effective service rates. MRR is a normalized comparison only, not what is charged each cycle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/subscriptions/customers/${subscription.customerId}/billing`} className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Customer billing</Link>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Cycle total (per {cycleUnitLabel(subscription.billingIntervalMonths)})</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">MRR equivalent</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.normalizedMrr, currency)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Next billing</dt><dd className="mt-1 font-semibold">{displayDate(subscription.nextBillingDate)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Billing method</dt><dd className="mt-1 font-semibold">{collectionLabel(subscription.collectionMethod)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Outstanding (this subscription)</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary?.outstandingBalance, currency)}</dd></div>
        </dl>
      </section>

      {issues.length ? (
        <section aria-label="Billing readiness issues" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">Billing readiness issues ({issues.length})</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950 dark:text-amber-200">{issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>
        </section>
      ) : null}

      <section aria-labelledby="collection-heading" className={`${cardClass} p-5`}>
        <h2 id="collection-heading" className="text-lg font-semibold">Collection method</h2>
        {subscription.collectionMethod === "manual_invoice" ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><strong>Recurring invoice.</strong> An invoice is issued automatically each cycle. The customer may pay by cash, cheque, bank transfer, or the invoice&apos;s optional card link. Payment terms: due after the invoice is issued, with {subscription.gracePeriodDays} days&apos; grace before it needs attention.</p>
        ) : subscription.collectionMethod === "stripe_autocharge" ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><strong>Automatic card billing (Stripe).</strong> Stripe manages collection for this subscription. A recurring invoice schedule is never created for the same obligation.</p>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">No collection method has been chosen yet.</p>
        )}
        {schedules.length ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Derived recurring invoice schedule</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {schedules.map((schedule) => (
                <li key={schedule.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 sm:flex-row dark:bg-zinc-950">
                  <span className="font-medium capitalize">{schedule.status.replaceAll("_", " ")} · every {schedule.intervalMonths} month{schedule.intervalMonths === 1 ? "" : "s"}</span>
                  <span className="text-zinc-500">Next invoice {displayDate(schedule.nextIssueDate)} · due {schedule.dueDaysAfterIssue} days after issue</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-zinc-500">This schedule is derived from the subscription. Change cadence, services or status here, not in the generic schedule editor.</p>
          </div>
        ) : null}
        {permissions.editable && subscription.collectionMethod ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Change collection method</h3>
            <p className="mt-1 text-xs text-zinc-500">Allowed only while the subscription is a draft. It does not create an invoice or contact Stripe.</p>
            <CanonicalSubscriptionCollectionForm subscriptionId={subscription.id} value={subscription.collectionMethod} />
          </div>
        ) : null}
      </section>

      {adjustmentRows.length ? (
        <section aria-labelledby="agreed-charges-heading" className="rounded-xl border border-amber-200 bg-white p-5 dark:border-amber-900 dark:bg-zinc-900">
          <h2 id="agreed-charges-heading" className="text-lg font-semibold">Agreed partial-period charges</h2>
          <p className="mt-1 text-sm text-zinc-500">Amounts agreed for the time between a service starting and joining the renewal. They are separate from the recurring total and are never assumed to be invoiced or paid.</p>
          <ul className="mt-4 space-y-3">
            {adjustmentRows.map(({ item, adjustment, status }) => {
              const invoice = adjustment.invoice;
              const adjustmentCurrency = adjustment.currency;
              const amountLabel = money(adjustment.amount.toString(), adjustmentCurrency);
              const monthlyEquivalent = adjustment.roundedMonths != null && subscription.billingIntervalMonths
                ? Number(adjustment.cycleAmount) / subscription.billingIntervalMonths
                : null;
              return (
                <li key={adjustment.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.label || "Tracking service"} — <span className="tabular-nums">{amountLabel}</span></p>
                      <p className="mt-1 text-sm text-zinc-500">{displayDate(adjustment.periodStart)} to {displayDate(adjustment.periodEnd)} · {adjustmentMethodLabel(adjustment.method)}</p>
                      {adjustment.roundedMonths != null && monthlyEquivalent != null ? <p className="mt-1 text-xs text-zinc-500">{adjustment.roundedMonths} month{adjustment.roundedMonths === 1 ? "" : "s"} × {money(monthlyEquivalent, adjustmentCurrency)}</p> : null}
                      <p className="mt-1 text-xs text-zinc-500">Recurring rate stays {money(adjustment.cycleAmount.toString(), adjustmentCurrency)} per {cycleUnitLabel(subscription.billingIntervalMonths)}; the agreed amount is a one-time charge for the partial period.</p>
                      {adjustment.method === "manual_amount" || (adjustment.method === "monthly_rounded" && Number(adjustment.dailyAmount) !== Number(adjustment.amount)) ? <p className="mt-1 text-xs text-zinc-500">Daily formula would be {money(adjustment.dailyAmount.toString(), adjustmentCurrency)}. The agreed amount is a deliberate override{adjustment.reason ? `: ${adjustment.reason}` : "."}</p> : null}
                    </div>
                    <span className={`mt-2 shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:mt-0 ${invoice ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{invoice ? invoice.status === "draft" ? "Draft invoice" : "Invoiced" : "Agreed · not invoiced"}</span>
                  </div>
                  {invoice ? (
                    invoice.status === "draft" ? (
                      <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">A draft invoice exists but is not finalized, so nothing has been billed. <Link href={`/admin/tl-invoices/${invoice.id}`} className="font-semibold underline">Open the draft to add lines or finalize it</Link>.</p>
                    ) : (
                      <p className="mt-3 text-sm"><Link href={`/admin/tl-invoices/${invoice.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{invoice.number ?? "Invoice"}</Link> · <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span> · paid {money(invoice.amountPaid.toString(), adjustmentCurrency)} · due {money(invoice.amountDue.toString(), adjustmentCurrency)}</p>
                    )
                  ) : permissions.canManage && status?.proposal && status.status === "preview_available" ? (
                    adjustmentExecutionEnabled ? (
                      <SubscriptionAdjustmentInvoiceForm subscriptionId={subscription.id} subscriptionItemId={item.id} generationKey={status.proposal.generationKey} confirmationToken={status.proposal.confirmationToken} amountLabel={amountLabel} />
                    ) : (
                      <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">No invoice exists for this charge. Creating draft invoices from here is not enabled in this environment, so nothing has been billed.</p>
                    )
                  ) : status && status.status === "blocked" ? (
                    <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{status.message}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {showAnnualAdjustment ? (
        <section aria-labelledby="annual-heading" className={`${cardClass} p-5`}>
          <h2 id="annual-heading" className="text-lg font-semibold">Annual additions</h2>
          <p className="mt-1 text-sm text-zinc-500">Working out the partial-period charge for a service joining an annual renewal mid-year is a controlled, preview-only step.</p>
          <Link href={subscriptionAnnualAdjustmentPath(subscription.id)} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Open annual adjustment preview</Link>
        </section>
      ) : null}
    </div>
  );
}
