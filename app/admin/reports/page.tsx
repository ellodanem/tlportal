import Link from "next/link";

import {
  AR_AGING_BUCKET_LABELS,
  AR_AGING_BUCKET_ORDER,
  formatReportMoney,
  monthLabelUtc,
  PAYMENT_METHOD_LABELS,
} from "@/lib/domain/billing-reports";
import { formatYearMonth, parseYearMonth } from "@/lib/domain/expenses";
import { INVOICE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { getBillingMonthlyReport } from "@/lib/services/native-billing-reporting-service";

type Props = { searchParams: Promise<{ ym?: string }> };

function formatYmd(d: Date | null): string {
  if (!d) return "—";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function AdminBillingReportsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { year, month } = parseYearMonth(sp.ym);
  const ym = formatYearMonth(year, month);
  const report = await getBillingMonthlyReport(year, month);
  const monthLabel = monthLabelUtc(year, month);

  const overdueRows = report.arAging.invoices.filter((row) => row.bucket !== "current");

  return (
    <div className="flex flex-col gap-8 print:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:block">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 print:hidden">
            <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-700 dark:text-zinc-300">Reports</span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Billing reports
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Cash-basis P&amp;L snapshot, AR aging, and expense breakdown from native TL billing data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <form method="get" className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">Month</label>
              <input
                type="month"
                name="ym"
                defaultValue={ym}
                className="mt-1 rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </div>
            <button type="submit" className="rounded-lg border px-4 py-2 text-sm font-semibold">
              Go
            </button>
          </form>
          <a
            href={`/api/admin/reports/export?ym=${ym}`}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Export CSV
          </a>
        </div>
      </div>

      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Period: {monthLabel}
        <span className="font-normal text-zinc-500">
          {" "}
          · AR aging as of {report.arAging.asOf.toLocaleDateString("en-029", { dateStyle: "medium" })}
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Revenue (cash in)
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-950 dark:text-emerald-100">
            {formatReportMoney(report.revenue.total)}
          </p>
          <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">
            {report.revenue.paymentCount} payment{report.revenue.paymentCount === 1 ? "" : "s"} recorded
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Expenses
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatReportMoney(report.expenses.total)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {report.expenses.count} expense{report.expenses.count === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            report.netCashFlow >= 0
              ? "border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/30"
              : "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Net (revenue − expenses)
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatReportMoney(report.netCashFlow)}</p>
          <p className="mt-1 text-xs text-zinc-500">Simple cash-basis snapshot for the month</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Revenue by payment method</h2>
          {report.revenue.byMethod.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No payments recorded this month.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {report.revenue.byMethod.map((row) => (
                <li key={row.method} className="flex justify-between gap-4">
                  <span>{PAYMENT_METHOD_LABELS[row.method]}</span>
                  <span className="tabular-nums font-medium">
                    {formatReportMoney(row.total)} <span className="text-zinc-500">({row.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Expenses by category</h2>
          {report.expenses.byCategory.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No expenses recorded this month.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {report.expenses.byCategory.map((row) => (
                <li key={row.categoryId ?? "none"} className="flex justify-between gap-4">
                  <span>{row.categoryName}</span>
                  <span className="tabular-nums font-medium">
                    {formatReportMoney(row.total)} <span className="text-zinc-500">({row.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">AR aging</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Outstanding {formatReportMoney(report.arAging.totalOutstanding)} across{" "}
              {report.arAging.invoices.length} open invoice{report.arAging.invoices.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href="/admin/tl-invoices"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400 print:hidden"
          >
            TL invoices →
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {AR_AGING_BUCKET_ORDER.map((bucket) => (
            <div
              key={bucket}
              className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{AR_AGING_BUCKET_LABELS[bucket]}</p>
              <p className="mt-1 font-semibold tabular-nums">{formatReportMoney(report.arAging.buckets[bucket].total)}</p>
              <p className="text-xs text-zinc-500">{report.arAging.buckets[bucket].count} invoices</p>
            </div>
          ))}
        </div>

        {overdueRows.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Client</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Due amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {overdueRows.map((row) => (
                  <tr key={row.invoiceId}>
                    <td className="px-2 py-2">
                      <Link
                        href={`/admin/tl-invoices/${row.invoiceId}`}
                        className="font-medium text-emerald-700 hover:underline dark:text-emerald-400 print:text-zinc-900 print:no-underline"
                      >
                        {row.number ?? row.invoiceId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">{row.customerLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{formatYmd(row.dueDate)}</td>
                    <td className="px-2 py-2">{INVOICE_STATUS_LABELS[row.status]}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatReportMoney(row.amountDue, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No overdue invoices — all outstanding amounts are current.</p>
        )}
      </section>

      <p className="text-xs text-zinc-500 print:hidden">
        Revenue uses payment received dates. Expenses use expense date. This is an operational snapshot, not formal
        accounting. Use Export CSV for spreadsheets; use your browser&apos;s Print → Save as PDF for a PDF copy.
      </p>
    </div>
  );
}
