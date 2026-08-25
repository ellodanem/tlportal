import Link from "next/link";

import type { CustomerStatement } from "@/lib/billing/customer-statement";
import { formatMoney, formatStatementLabel } from "@/lib/billing/customer-statement";

function formatActivityDate(d: Date): string {
  return d.toLocaleDateString("en-029", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/St_Lucia",
  });
}

export function CustomerStatementPreview({ statement }: { statement: CustomerStatement }) {
  const cur = statement.currency;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Opening balance" amount={statement.openingBalance} currency={cur} />
        <SummaryCard label="Charges" amount={statement.periodCharges} currency={cur} />
        <SummaryCard label="Credits" amount={statement.periodCredits} currency={cur} />
        <SummaryCard label="Closing balance" amount={statement.closingBalance} currency={cur} highlight />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {formatStatementLabel(statement.periodFrom)} – {formatStatementLabel(statement.periodTo)}
          </p>
        </div>
        {statement.activity.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No invoices or payments in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Charges</th>
                  <th className="px-4 py-2 text-right">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {statement.activity.map((row) => (
                  <tr key={`${row.kind}-${row.invoiceId ?? row.paymentId}-${row.date.toISOString()}`}>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{formatActivityDate(row.date)}</td>
                    <td className="px-4 py-2 font-medium">
                      {row.invoiceId ? (
                        <Link
                          href={`/admin/tl-invoices/${row.invoiceId}`}
                          className="text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          {row.reference}
                        </Link>
                      ) : (
                        row.reference
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{row.description}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.charge > 0 ? formatMoney(row.charge, cur) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.credit > 0 ? formatMoney(row.credit, cur) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Outstanding invoices</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Current open balances (as of now)</p>
        </div>
        {statement.outstanding.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No outstanding invoices.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Issue date</th>
                  <th className="px-4 py-2">Due date</th>
                  <th className="px-4 py-2 text-right">Amount due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {statement.outstanding.map((row) => (
                  <tr key={row.invoiceId}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/tl-invoices/${row.invoiceId}`}
                        className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {row.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{formatActivityDate(row.issueDate)}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {row.dueDate ? formatActivityDate(row.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {formatMoney(row.amountDue, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Opening balance is the amount still owing on invoices issued before this period. Closing balance = opening +
        charges − credits.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  currency,
  highlight,
}: {
  label: string;
  amount: number;
  currency: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(amount, currency)}</p>
    </div>
  );
}
