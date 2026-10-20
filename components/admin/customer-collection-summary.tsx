import Link from "next/link";

import type { CustomerCollectionSummary as Summary } from "@/lib/domain/customer-collection-summary";

function formatDate(value: Date | null) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "None recorded";
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-EC", { style: "currency", currency: currency.toUpperCase() }).format(value);
}

const toneClasses: Record<Summary["tone"], string> = {
  danger: "border-rose-300 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/25",
  warning: "border-amber-300 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/25",
  success: "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20",
  neutral: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
};

const headlineClasses: Record<Summary["tone"], string> = {
  danger: "text-rose-900 dark:text-rose-100",
  warning: "text-amber-900 dark:text-amber-100",
  success: "text-emerald-900 dark:text-emerald-100",
  neutral: "text-zinc-900 dark:text-zinc-50",
};

export function CustomerCollectionSummary({ customerId, summary }: { customerId: string; summary: Summary }) {
  const invoice = summary.latestInvoice;
  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneClasses[summary.tone]}`} aria-label="Customer payment status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Collection status</p>
          <h2 className={`mt-1 text-xl font-semibold ${headlineClasses[summary.tone]}`}>{summary.headline}</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-700 dark:text-zinc-300">{summary.detail}</p>
        </div>
        <Link href={`/admin/customers/${customerId}/billing`} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-white/80 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-white dark:bg-zinc-900/80 dark:text-emerald-300 dark:hover:bg-zinc-900">Review billing</Link>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-white/75 p-3 dark:bg-zinc-950/45">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Outstanding</dt>
          <dd className={`mt-1 text-lg font-semibold tabular-nums ${summary.outstandingAmount > 0 ? "text-rose-800 dark:text-rose-200" : "text-zinc-900 dark:text-zinc-50"}`}>{summary.outstandingAmount > 0 ? formatMoney(summary.outstandingAmount, summary.currency) : summary.state === "overdue" || summary.state === "failed" ? "Amount not captured" : formatMoney(0, summary.currency)}</dd>
          <p className="mt-1 text-xs text-zinc-500">{summary.outstandingAmount === 0 && (summary.state === "overdue" || summary.state === "failed") ? "No open invoice amount is recorded" : "Recorded open invoices"}</p>
        </div>
        <div className="rounded-xl bg-white/75 p-3 dark:bg-zinc-950/45">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Latest invoice</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{invoice?.number ?? "No invoice recorded"}</dd>
          <p className="mt-1 text-xs capitalize text-zinc-500">{invoice ? `${invoice.status.replaceAll("_", " ")} · ${formatMoney(invoice.amount, invoice.currency)}` : "Current payment cannot be confirmed from an invoice"}</p>
        </div>
        <div className="rounded-xl bg-white/75 p-3 dark:bg-zinc-950/45">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Last payment</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{formatDate(summary.lastPaymentAt)}</dd>
          <p className="mt-1 text-xs text-zinc-500">{summary.paidThrough ? `Paid through ${formatDate(summary.paidThrough)}` : "No paid-through period recorded"}</p>
        </div>
        <div className="rounded-xl bg-white/75 p-3 dark:bg-zinc-950/45">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Invoice delivery</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{summary.deliveryLabel}</dd>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{summary.deliveryDetail}</p>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <span>Service renewal due: <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{formatDate(summary.serviceRenewalDueDate)}</strong></span>
        <span>Subscription next billing: <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{formatDate(summary.subscriptionRenewalDate)}</strong></span>
        {summary.renewalDatesDisagree ? <span className="font-semibold text-amber-800 dark:text-amber-300">Dates disagree — review the billing record.</span> : null}
      </div>
    </section>
  );
}
