import Link from "next/link";

import { BillingWorkspaceHeader } from "@/components/admin/billing-workspace";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { formatMoney, RECURRING_SCHEDULE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

function scheduleClientLabel(row: { name: string | null; billToName: string | null; customer: { company: string | null; firstName: string | null; lastName: string | null } | null }): string {
  if (row.name?.trim()) return row.name.trim();
  if (row.billToName?.trim()) return row.billToName.trim();
  return row.customer ? customerDisplayName(row.customer) : "—";
}

function intervalLabel(months: number): string {
  return months === 1 ? "Monthly" : months === 3 ? "Quarterly" : months === 6 ? "Semi-annual" : months === 12 ? "Annual" : `${months} mo`;
}

function formatYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function AdminRecurringInvoicesPage() {
  const schedules = await prisma.recurringInvoiceSchedule.findMany({
    orderBy: { updatedAt: "desc" },
    include: { customer: { select: { company: true, firstName: true, lastName: true } }, lineItems: { orderBy: { sortOrder: "asc" } }, lastInvoice: { select: { id: true, number: true, total: true, currency: true } } },
  });
  const activeCount = schedules.filter((schedule) => schedule.status === "active").length;
  const pausedCount = schedules.filter((schedule) => schedule.status === "paused").length;
  const scheduledValue = schedules.filter((schedule) => schedule.status === "active").reduce((sum, schedule) => sum + schedule.lineItems.reduce((lines, line) => lines + Number(line.lineTotal), 0), 0);

  return <div className="flex flex-col gap-6">
    <BillingWorkspaceHeader active="recurring" title="Recurring invoices" subtitle="Manage automatic invoice generation for manual-collection customers." primaryHref="/admin/recurring-invoices/new" primaryLabel="New recurring schedule" />
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"><strong>Manual collection only.</strong> Schedules generate native invoices on their due dates independently of payment recording. Stripe-managed subscriptions remain under Stripe authority and do not belong here.</p>
    <div className="grid gap-3 sm:grid-cols-3"><section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20"><p className="text-sm text-zinc-600 dark:text-zinc-400">Active schedules</p><p className="mt-1 text-2xl font-semibold">{activeCount}</p><p className="mt-1 text-xs text-zinc-500">Generating invoices automatically</p></section><section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-sm text-zinc-600 dark:text-zinc-400">Paused schedules</p><p className="mt-1 text-2xl font-semibold">{pausedCount}</p><p className="mt-1 text-xs text-zinc-500">Not generating while paused</p></section><section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-sm text-zinc-600 dark:text-zinc-400">Scheduled value</p><p className="mt-1 text-2xl font-semibold">{formatMoney(scheduledValue, "XCD")}</p><p className="mt-1 text-xs text-zinc-500">Active schedules; amounts are not currency-converted</p></section></div>
    {schedules.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">No recurring schedules yet. Create one for a manual-collection customer who should receive invoices on a cadence.</p> : <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Schedules</h2><p className="mt-1 text-sm text-zinc-500">Legacy recurring schedules remain separate from canonical subscription billing.</p></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Name / customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Next invoice</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Last invoice</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{schedules.map((schedule) => { const total = schedule.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0); return <tr key={schedule.id}><td className="px-4 py-3 font-medium">{scheduleClientLabel(schedule)}</td><td className="px-4 py-3"><span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize dark:bg-zinc-800">{RECURRING_SCHEDULE_STATUS_LABELS[schedule.status]}</span></td><td className="px-4 py-3">{intervalLabel(schedule.intervalMonths)}</td><td className="px-4 py-3 tabular-nums">{formatYmd(schedule.nextIssueDate)}</td><td className="px-4 py-3 tabular-nums">{formatMoney(total, schedule.currency)}</td><td className="px-4 py-3">{schedule.lastInvoice ? <Link href={`/admin/tl-invoices/${schedule.lastInvoice.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{schedule.lastInvoice.number ?? "Invoice"}</Link> : "—"}</td><td className="px-4 py-3 text-right"><Link href={`/admin/recurring-invoices/${schedule.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>; })}</tbody></table></div></section>}
  </div>;
}
