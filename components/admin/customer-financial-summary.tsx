import Link from "next/link";

import { formatMoney, INVOICE_STATUS_LABELS, invoiceStatusBadgeClass } from "@/lib/domain/native-billing";
import type { InvoiceStatus } from "@prisma/client";

type RecentInvoice = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  amountDue: number;
  total: number;
  currency: string;
  dueDate: Date | null;
};

export function CustomerFinancialSummary({
  customerId,
  amountDue,
  openInvoiceCount,
  quoteCount,
  activeScheduleCount,
  recentInvoices,
}: {
  customerId: string;
  amountDue: number;
  openInvoiceCount: number;
  quoteCount: number;
  activeScheduleCount: number;
  recentInvoices: RecentInvoice[];
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Financial snapshot</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Recorded TL Portal invoices only. A zero here does not confirm that the current renewal was paid.</p>
        </div>
        <Link href={`/admin/customers/${customerId}/billing`} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open billing →</Link>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Recorded balance due</dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums ${amountDue > 0 ? "text-rose-700 dark:text-rose-300" : "text-zinc-900 dark:text-zinc-50"}`}>{formatMoney(amountDue)}</dd>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Recorded open invoices</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{openInvoiceCount}</dd>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Quotes / recurring</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{quoteCount} / {activeScheduleCount}</dd>
        </div>
      </dl>
      {recentInvoices.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr><th className="py-2 pr-4">Invoice</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Due</th><th className="py-2 text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recentInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="py-2 pr-4"><Link href={`/admin/tl-invoices/${invoice.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{invoice.number ?? "Draft invoice"}</Link></td>
                  <td className="py-2 pr-4"><span className={invoiceStatusBadgeClass(invoice.status)}>{INVOICE_STATUS_LABELS[invoice.status]}</span></td>
                  <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{invoice.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(invoice.amountDue, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No native invoices have been recorded for this customer yet.</p>}
    </section>
  );
}
