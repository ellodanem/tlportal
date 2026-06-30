import Link from "next/link";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { formatMoney, RECURRING_SCHEDULE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

function scheduleClientLabel(row: {
  name: string | null;
  billToName: string | null;
  customer: { company: string | null; firstName: string | null; lastName: string | null } | null;
}): string {
  if (row.name?.trim()) return row.name.trim();
  if (row.billToName?.trim()) return row.billToName.trim();
  if (row.customer) return customerDisplayName(row.customer);
  return "—";
}

function intervalLabel(months: number): string {
  if (months === 1) return "Monthly";
  if (months === 3) return "Quarterly";
  if (months === 6) return "Semi-annual";
  if (months === 12) return "Annual";
  return `${months} mo`;
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function AdminRecurringInvoicesPage() {
  const schedules = await prisma.recurringInvoiceSchedule.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      customer: { select: { company: true, firstName: true, lastName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      lastInvoice: { select: { id: true, number: true, total: true, currency: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-700 dark:text-zinc-300">Recurring invoices</span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Recurring invoices
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Auto-generate TL invoices on a schedule for cash, cheque, and bank payers — replaces Invoiless retainers.
            A daily cron issues due schedules and emails invoices when configured.
          </p>
        </div>
        <Link
          href="/admin/recurring-invoices/new"
          className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
        >
          New schedule
        </Link>
      </div>

      {schedules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          No recurring schedules yet. Create one for customers who pay by cash or cheque on a monthly or quarterly
          cadence.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name / client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Interval</th>
                <th className="px-4 py-3">Next issue</th>
                <th className="px-4 py-3">Last invoice</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {schedules.map((s) => {
                const cycleTotal = s.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0);
                return (
                  <tr key={s.id} className="text-zinc-800 dark:text-zinc-200">
                    <td className="px-4 py-3 font-medium">{scheduleClientLabel(s)}</td>
                    <td className="px-4 py-3">{RECURRING_SCHEDULE_STATUS_LABELS[s.status]}</td>
                    <td className="px-4 py-3">{intervalLabel(s.intervalMonths)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatYmd(s.nextIssueDate)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {s.lastInvoice ? (
                        <Link
                          href={`/admin/tl-invoices/${s.lastInvoice.id}`}
                          className="text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          {s.lastInvoice.number ?? "Invoice"}
                        </Link>
                      ) : cycleTotal > 0 ? (
                        formatMoney(cycleTotal, s.currency)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/recurring-invoices/${s.id}`}
                        className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
