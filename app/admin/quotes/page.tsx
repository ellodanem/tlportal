import Link from "next/link";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { formatMoney, QUOTE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

function quoteClientLabel(row: {
  number: string | null;
  billToName: string | null;
  customer: { company: string | null; firstName: string | null; lastName: string | null } | null;
}): string {
  if (row.billToName?.trim()) return row.billToName.trim();
  if (row.customer) return customerDisplayName(row.customer);
  return "—";
}

export default async function AdminQuotesPage() {
  const quotes = await prisma.quote.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      billToName: true,
      total: true,
      currency: true,
      issueDate: true,
      updatedAt: true,
      convertedInvoiceId: true,
      customer: {
        select: { company: true, firstName: true, lastName: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-700 dark:text-zinc-300">Quotes</span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Quotes</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Saved estimates with TL-Q numbering when marked sent or emailed. Convert accepted quotes to draft native invoices — no
            Invoiless required.
          </p>
        </div>
        <Link
          href="/admin/quotes/new"
          className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          New quote
        </Link>
      </div>

      {quotes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          No quotes yet. Create one to build a fleet estimate, download a PDF, email it, or convert to an invoice.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {quotes.map((q) => (
                <tr key={q.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3 font-medium">{q.number ?? "Draft"}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{quoteClientLabel(q)}</td>
                  <td className="px-4 py-3">{QUOTE_STATUS_LABELS[q.status]}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(Number(q.total), q.currency)}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {q.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/quotes/${q.id}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Open
                    </Link>
                    {q.number ? (
                      <>
                        <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
                        <a
                          href={`/api/admin/quotes/${q.id}/pdf`}
                          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          PDF
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
