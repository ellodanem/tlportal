import Link from "next/link";

import { customerDisplayName } from "@/lib/admin/customer-display";
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  formatExpenseAmount,
  formatYearMonth,
  parseYearMonth,
} from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import { expenseListWhere, expenseMonthlyTotals } from "@/lib/services/expense-service";

type Props = { searchParams: Promise<{ ym?: string; category?: string }> };

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function AdminExpensesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { year, month } = parseYearMonth(sp.ym);
  const categoryFilter = (sp.category ?? "").trim() || null;
  const ym = formatYearMonth(year, month);

  const [expenses, totals, categories] = await Promise.all([
    prisma.expense.findMany({
      where: expenseListWhere({ year, month, categoryId: categoryFilter }),
      orderBy: { expenseDate: "desc" },
      include: {
        category: { select: { name: true } },
        customer: { select: { company: true, firstName: true, lastName: true } },
        device: { select: { label: true, imei: true } },
      },
    }),
    expenseMonthlyTotals(year, month),
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-029", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-700 dark:text-zinc-300">Expenses</span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Expenses</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Simple expense register — vendor, category, receipt, and optional customer or device attribution.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/expenses/categories"
            className="inline-flex justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold"
          >
            Categories
          </Link>
          <Link
            href="/admin/expenses/new"
            className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            New expense
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-end sm:justify-between">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Month</label>
            <input
              type="month"
              name="ym"
              defaultValue={ym}
              className="mt-1 rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Category</label>
            <select
              name="category"
              defaultValue={categoryFilter ?? ""}
              className="mt-1 rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg border px-4 py-2 text-sm font-semibold">
            Filter
          </button>
        </form>
        <div className="text-right">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{monthLabel}</p>
          <p className="text-lg font-semibold tabular-nums">{formatExpenseAmount(totals.total)}</p>
          <p className="text-xs text-zinc-500">{totals.count} expense{totals.count === 1 ? "" : "s"}</p>
          <a
            href={`/api/admin/expenses/export?ym=${ym}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
            className="mt-1 inline-block text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Export CSV
          </a>
        </div>
      </div>

      {totals.byCategory.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {totals.byCategory.map((row) => (
            <div
              key={row.categoryId ?? "none"}
              className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <p className="font-medium">{row.categoryName}</p>
              <p className="tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatExpenseAmount(row.total)} · {row.count}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {expenses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          No expenses for this period. Record SIM purchases, hardware, fuel, or other ops costs.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Attributed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 tabular-nums">{formatYmd(e.expenseDate)}</td>
                  <td className="px-4 py-3 font-medium">{e.vendor}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{e.category?.name ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{formatExpenseAmount(Number(e.amount), e.currency)}</td>
                  <td className="px-4 py-3">{EXPENSE_PAYMENT_METHOD_LABELS[e.method]}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {e.customer ? customerDisplayName(e.customer) : e.device?.label?.trim() || e.device?.imei || "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/expenses/${e.id}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Open
                    </Link>
                    {e.receiptStoragePath ? (
                      <>
                        <span className="mx-2 text-zinc-300">·</span>
                        <a
                          href={`/api/admin/expenses/${e.id}/receipt`}
                          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          Receipt
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
