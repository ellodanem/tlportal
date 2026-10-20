import Link from "next/link";
import type { InvoiceStatus } from "@prisma/client";

import type { CustomerCollectionSummary as Summary } from "@/lib/domain/customer-collection-summary";
import { formatMoney, INVOICE_STATUS_LABELS, invoiceStatusBadgeClass } from "@/lib/domain/native-billing";

type NativeInvoice = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  amountDue: unknown;
  currency: string;
  issueDate: Date;
  dueDate: Date | null;
};

function formatDate(value: Date | null) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "None recorded";
}

const toneClasses: Record<Summary["tone"], string> = {
  danger: "border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20",
  warning: "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20",
  success: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20",
  neutral: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
};

const headlineClasses: Record<Summary["tone"], string> = {
  danger: "text-rose-700 dark:text-rose-300",
  warning: "text-amber-800 dark:text-amber-200",
  success: "text-emerald-800 dark:text-emerald-200",
  neutral: "text-zinc-900 dark:text-zinc-50",
};

export function CustomerCollectionSummary({
  customerId,
  summary,
  primaryInvoice = null,
  hasSubscriptions = false,
  reminderAvailable = false,
}: {
  customerId: string;
  summary: Summary;
  primaryInvoice?: NativeInvoice | null;
  hasSubscriptions?: boolean;
  reminderAvailable?: boolean;
}) {
  const recordPaymentEligible = primaryInvoice && ["open", "partially_paid", "overdue"].includes(primaryInvoice.status);
  const hasInvoice = primaryInvoice != null;
  const noInvoiceActivity = summary.latestInvoice == null && primaryInvoice == null;
  const title = noInvoiceActivity && summary.state !== "overdue" && summary.state !== "failed" ? "No invoices yet" : summary.state === "paid" ? "Account up to date" : summary.headline;
  const detail = noInvoiceActivity && summary.state !== "overdue" && summary.state !== "failed"
    ? "This customer does not have any recorded invoices."
    : summary.state === "paid"
      ? "No outstanding invoices."
      : summary.detail;
  const outstanding = summary.outstandingAmount > 0
    ? formatMoney(summary.outstandingAmount, summary.currency)
    : summary.providerBalanceRequiresReview
      ? "Review required"
    : summary.state === "overdue" || summary.state === "failed"
      ? "Review required"
      : formatMoney(0, summary.currency);

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${toneClasses[summary.tone]}`} aria-label="Customer payment status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${headlineClasses[summary.tone]}`}>{title}</h2>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{detail}</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{summary.providerBalanceRequiresReview ? "Provider balance" : "Confirmed outstanding balance"}</p>
          <p className={`mt-0.5 text-xl font-semibold tabular-nums ${summary.outstandingAmount > 0 ? headlineClasses[summary.tone] : "text-zinc-900 dark:text-zinc-50"}`}>{outstanding}</p>
        </div>
      </div>

      <dl className="mt-4 grid divide-y divide-zinc-200/70 rounded-xl bg-white/70 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800/80 dark:bg-zinc-950/25">
        <div className="p-3">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Latest invoice</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
            {primaryInvoice?.number ?? summary.latestInvoice?.number ?? "No invoice recorded"}
            {primaryInvoice ? <span className={invoiceStatusBadgeClass(primaryInvoice.status)}>{INVOICE_STATUS_LABELS[primaryInvoice.status]}</span> : null}
          </dd>
          <p className="mt-1 text-xs text-zinc-500">{primaryInvoice?.dueDate ? `Due ${formatDate(primaryInvoice.dueDate)}` : summary.deliveryLabel}</p>
        </div>
        <div className="p-3">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Last payment</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{formatDate(summary.lastPaymentAt)}</dd>
          <p className="mt-1 text-xs text-zinc-500">{summary.paidThrough ? `Paid through ${formatDate(summary.paidThrough)}` : "No paid-through period recorded"}</p>
        </div>
        <div className="p-3">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Next renewal</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{formatDate(summary.subscriptionRenewalDate ?? summary.serviceRenewalDueDate)}</dd>
          <p className="mt-1 text-xs text-zinc-500">{summary.renewalDatesDisagree ? "Billing dates need review" : "Subscription renewal context"}</p>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {hasInvoice ? <Link href={`/admin/tl-invoices/${primaryInvoice.id}`} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">View invoice</Link> : null}
        {recordPaymentEligible ? <Link href={`/admin/tl-invoices/${primaryInvoice.id}#record-payment`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">Record payment</Link> : null}
        {reminderAvailable ? <a href="#collection-notifications" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">Send reminder</a> : null}
        {!hasInvoice ? <Link href="/admin/tl-invoices/new" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Create invoice</Link> : null}
        {hasSubscriptions ? <Link href={`/admin/customers/${customerId}/subscriptions`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">View subscriptions</Link> : null}
      </div>
    </section>
  );
}
