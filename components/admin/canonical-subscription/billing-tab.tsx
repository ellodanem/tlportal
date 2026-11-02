import Link from "next/link";

import {
  adjustmentMethodLabel,
  cardClass,
  displayDate,
  money,
  nativeBillingReadinessIssues,
} from "@/components/admin/canonical-subscription/format";
import { CanonicalBillingDatesDialog } from "@/components/admin/canonical-billing-dates-dialog";
import { CanonicalSubscriptionCollectionForm } from "@/components/admin/canonical-subscription-collection-form";
import { SubscriptionLedgerTable } from "@/components/admin/financial-ledger-table";
import { SubscriptionAdjustmentInvoiceForm } from "@/components/admin/subscription-adjustment-invoice-form";
import { canonicalAnnualAdjustmentExecutionEnabled } from "@/lib/domain/canonical-annual-adjustment";
import { daysUntil } from "@/lib/domain/canonical-service-presentation";
import { subscriptionAnnualAdjustmentPath, subscriptionBillingPath } from "@/lib/domain/canonical-subscription-navigation";
import { NOT_LINKED_LABEL } from "@/lib/domain/financial-ledger";
import { formatMoney } from "@/lib/domain/native-billing";
import { cycleUnitLabel } from "@/lib/domain/subscription-proration";
import { getSubscriptionFinancials } from "@/lib/services/financial-ledger-service";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

export type LedgerFilter = "all" | "open" | "paid";

export function parseLedgerFilter(value: string | undefined): LedgerFilter {
  return value === "open" || value === "paid" ? value : "all";
}

const secondaryButtonClass = "inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function relativeDays(date: Date | null): string | null {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return days === -1 ? "1 day ago" : `${-days} days ago`;
}

/**
 * Everything about money on one subscription, ordered by urgency: what needs attention, what
 * happens next, how it is collected, then what has already been invoiced and paid. The header
 * summary strip already shows totals on every tab, so they are not repeated here.
 */
export async function SubscriptionBillingTab({ subscription, permissions, filter = "all" }: { subscription: SubscriptionDetail; permissions: SubscriptionPermissions; filter?: LedgerFilter }) {
  const ledger = await getSubscriptionFinancials(subscription.id, subscription.customerId);
  const currency = subscription.currency ?? "XCD";
  const customerBillingHref = `/admin/subscriptions/customers/${subscription.customerId}/billing`;
  const billingPath = subscriptionBillingPath(subscription.id);
  const openRows = ledger.rows.filter((row) => row.countsAsOutstanding);
  const paidRows = ledger.rows.filter((row) => row.status.toLowerCase() === "paid");
  const visibleRows = filter === "open" ? openRows : filter === "paid" ? paidRows : ledger.rows;
  const outstanding = ledger.outstanding;
  const showMrr = subscription.billingIntervalMonths != null && subscription.billingIntervalMonths !== 1;
  const nextNote = relativeDays(subscription.nextBillingDate);
  const activeServices = subscription.items.filter((item) => !["ended", "canceled"].includes(item.status));
  const adjustmentRows = activeServices.flatMap((item) => item.initialAdjustment
    ? [{ item, adjustment: item.initialAdjustment, status: subscription.adjustmentStatuses.find((entry) => entry.itemId === item.id) ?? null }]
    : []);
  const adjustmentExecutionEnabled = canonicalAnnualAdjustmentExecutionEnabled();
  const issues = nativeBillingReadinessIssues(subscription);
  const schedules = subscription.recurringSchedules;
  const showAnnualAdjustment = subscription.billingIntervalMonths === 12 && subscription.controlMode !== "legacy";
  // Date correction is refused once any invoice exists, so only offer it while the ledger is empty.
  const canCorrectDates = permissions.canManage
    && subscription.collectionMethod === "manual_invoice"
    && ledger.rows.length === 0
    && Boolean(subscription.commercialStartDate && subscription.nextBillingDate && subscription.billingIntervalMonths);

  return (
    <div className="flex flex-col gap-5">
      {subscription.summary?.attentionRequired ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
          <span className="font-semibold">Review collection.</span> An open balance is beyond grace or a provider operation needs review.{outstanding && outstanding.amount > 0 ? ` ${formatMoney(outstanding.amount, outstanding.currency)} is outstanding on this subscription.` : ""} Open invoices are listed below.
        </div>
      ) : null}

      {issues.length ? (
        <section aria-label="Billing readiness issues" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">Billing readiness issues ({issues.length})</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950 dark:text-amber-200">{issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-labelledby="next-charge-heading" className={`${cardClass} p-5`}>
        <h2 id="next-charge-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next charge</h2>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight">{displayDate(subscription.nextBillingDate)}</span>
          {nextNote ? <span className="text-sm text-zinc-500">{nextNote}</span> : null}
          {canCorrectDates && subscription.commercialStartDate && subscription.nextBillingDate && subscription.billingIntervalMonths ? (
            <CanonicalBillingDatesDialog
              subscriptionId={subscription.id}
              startDate={subscription.commercialStartDate.toISOString().slice(0, 10)}
              renewalDate={subscription.nextBillingDate.toISOString().slice(0, 10)}
              intervalMonths={subscription.billingIntervalMonths}
            />
          ) : null}
        </p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-lg font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</span>
          <span className="text-zinc-500">per {cycleUnitLabel(subscription.billingIntervalMonths)}</span>
          {showMrr ? <span className="text-zinc-500">· MRR equivalent {money(subscription.normalizedMrr, currency)}</span> : null}
        </p>
        <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          {subscription.collectionMethod === "stripe_autocharge"
            ? "Stripe charges the saved card automatically on this date. TL Portal does not create an invoice for the cycle."
            : subscription.collectionMethod === "manual_invoice"
              ? `TL Portal issues an invoice on this date. It is due ${schedules[0]?.dueDaysAfterIssue != null ? `${schedules[0].dueDaysAfterIssue} days after issue` : "after it is issued"}, with ${subscription.gracePeriodDays ?? 0} days' grace before it needs attention.`
              : "No collection method has been chosen yet, so nothing will be billed automatically."}
          {" "}The amount comes from each service&apos;s effective rate.
        </p>
        {showAnnualAdjustment ? (
          <p className="mt-3 text-sm text-zinc-500">
            Adding a service mid-year?{" "}
            <Link href={subscriptionAnnualAdjustmentPath(subscription.id)} className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">Preview the partial-period charge</Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="collection-heading" className={`${cardClass} p-5`}>
        <h2 id="collection-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">How it is collected</h2>
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={customerBillingHref} className={secondaryButtonClass}>Customer billing</Link>
          <Link href={`/admin/tl-invoices/new?customerId=${subscription.customerId}`} className={secondaryButtonClass}>Create invoice</Link>
        </div>
      </section>
      </div>

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

      <section aria-labelledby="invoices-heading" className={cardClass}>
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800">
          <div>
            <h2 id="invoices-heading" className="text-lg font-semibold">Invoices and payments</h2>
            {ledger.rows.length ? (
              <p className="mt-1 text-sm text-zinc-500">Each payment is shown on the invoice it paid. Outstanding for this subscription: <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{outstanding ? formatMoney(outstanding.amount, outstanding.currency) : ledger.totalsByCurrency.length > 1 ? "Multiple currencies" : formatMoney(0, currency)}</span>.</p>
            ) : null}
          </div>
          {ledger.rows.length ? (
          <nav aria-label="Filter invoices" className="flex flex-wrap gap-2">
            {([["all", "All", ledger.rows.length], ["open", "Open", openRows.length], ["paid", "Paid", paidRows.length]] as const).map(([key, label, count]) => (
              <Link
                key={key}
                href={key === "all" ? billingPath : `${billingPath}?show=${key}`}
                aria-current={filter === key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${filter === key ? "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
              >
                {label} {count}
              </Link>
            ))}
          </nav>
          ) : null}
        </div>
        {ledger.rows.length === 0 ? (
          <div className="p-5 text-sm">
            <p className="font-semibold">No invoices yet</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-300">
              {subscription.collectionMethod === "stripe_autocharge"
                ? "Stripe invoices may not be matched to this subscription yet, which is not the same as nothing being billed. "
                : "Nothing has been invoiced for this subscription. "}
              Other invoices for this customer are in the{" "}
              <Link href={subscription.collectionMethod === "stripe_autocharge" ? `${customerBillingHref}#provider-invoices` : customerBillingHref} className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
                {subscription.collectionMethod === "stripe_autocharge" ? "provider invoices" : "customer ledger"}
              </Link>.
            </p>
          </div>
        ) : (
          <SubscriptionLedgerTable rows={visibleRows} payments={ledger.payments} customerId={subscription.customerId} emptyMessage={filter === "open" ? "No open invoices on this subscription." : "No paid invoices on this subscription yet."} />
        )}
      </section>

      {ledger.unlinked.count > 0 ? (
        <section role="note" className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="font-semibold">{ledger.unlinked.count} customer invoice{ledger.unlinked.count === 1 ? "" : "s"}: {NOT_LINKED_LABEL}</h2>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">These belong to {subscription.customerLabel} but are not attached to any subscription, so they are not counted above{ledger.unlinked.outstandingByCurrency.some((entry) => entry.amount > 0) ? ` (open balance ${ledger.unlinked.outstandingByCurrency.filter((entry) => entry.amount > 0).map((entry) => formatMoney(entry.amount, entry.currency)).join(", ")})` : ""}. Typical examples are installation, hardware or one-off charges.</p>
          <p className="mt-2"><Link href={customerBillingHref} className="font-semibold text-emerald-700 underline dark:text-emerald-400">View the full customer ledger</Link></p>
        </section>
      ) : null}
    </div>
  );
}
