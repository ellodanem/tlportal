import Link from "next/link";

import { WorkQueueToolbar } from "@/components/admin/work-queue-toolbar";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { CUSTOMER_SUBSCRIPTION_STATUS_LABEL } from "@/lib/domain/customer-subscription";
import { prisma } from "@/lib/db";

type Props = { searchParams: Promise<{ view?: string; q?: string }> };
type SubscriptionRow = { id: string; kind: "card" | "manual"; customerId: string; customer: string; email: string | null; plan: string; amount: number; currency: string; status: string; statusLabel: string; nextDate: Date | null; href: string; attention: boolean };

function intervalLabel(months: number) {
  if (months === 1) return "Monthly";
  if (months === 12) return "Annual";
  return `Every ${months} months`;
}

function isWithinDays(date: Date | null, days: number) {
  if (!date) return false;
  const diff = date.getTime() - Date.now();
  return diff >= 0 && diff <= days * 86_400_000;
}

export default async function AdminSubscriptionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const requestedView = sp.view ?? "all";
  const view = ["all", "active", "attention", "card", "manual", "paused", "ended"].includes(requestedView) ? requestedView : "all";
  const customerFilter = query ? { OR: [{ company: { contains: query, mode: "insensitive" as const } }, { firstName: { contains: query, mode: "insensitive" as const } }, { lastName: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] } : undefined;
  const [stripeSubscriptions, manualSchedules] = await Promise.all([
    view === "manual" ? Promise.resolve([]) : prisma.customerSubscription.findMany({ where: { customer: customerFilter }, orderBy: { updatedAt: "desc" }, include: { customer: { select: { id: true, company: true, firstName: true, lastName: true, email: true } } } }),
    view === "card" ? Promise.resolve([]) : prisma.recurringInvoiceSchedule.findMany({ where: { customer: customerFilter }, orderBy: { updatedAt: "desc" }, include: { customer: { select: { id: true, company: true, firstName: true, lastName: true, email: true } }, lineItems: { select: { quantity: true, unitPrice: true } } } }),
  ]);
  const customerName = (customer: { company: string | null; firstName: string | null; lastName: string | null }) => customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unnamed customer";
  const rows: SubscriptionRow[] = [
    ...stripeSubscriptions.map((subscription) => {
      const amount = Number(subscription.monthlyRateXcd ?? 0) * (subscription.vehicleCount ?? 1);
      const attention = ["past_due", "unpaid", "pending_payment"].includes(subscription.status) || isWithinDays(subscription.currentPeriodEnd, 14);
      return { id: subscription.id, kind: "card" as const, customerId: subscription.customer.id, customer: customerName(subscription.customer), email: subscription.customer.email, plan: `${intervalLabel(subscription.planTermMonths)} · ${subscription.vehicleCount ?? 1} vehicle${(subscription.vehicleCount ?? 1) === 1 ? "" : "s"}`, amount, currency: "XCD", status: subscription.status, statusLabel: CUSTOMER_SUBSCRIPTION_STATUS_LABEL[subscription.status], nextDate: subscription.currentPeriodEnd, href: `/admin/customers/${subscription.customer.id}/billing`, attention };
    }),
    ...manualSchedules.map((schedule) => {
      const amount = schedule.lineItems.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
      const attention = schedule.status === "paused" || schedule.status === "ended" || isWithinDays(schedule.nextIssueDate, 14);
      const statusLabel = schedule.status === "active" ? "Active" : schedule.status === "paused" ? "Paused" : "Ended";
      return { id: schedule.id, kind: "manual" as const, customerId: schedule.customer?.id ?? "", customer: schedule.customer ? customerName(schedule.customer) : schedule.name ?? "Unassigned customer", email: schedule.customer?.email ?? null, plan: `${intervalLabel(schedule.intervalMonths)} · manual invoice`, amount: schedule.intervalMonths > 0 ? amount / schedule.intervalMonths : amount, currency: schedule.currency, status: schedule.status, statusLabel, nextDate: schedule.nextIssueDate, href: `/admin/recurring-invoices/${schedule.id}`, attention };
    }),
  ].filter((row) => view === "active" ? row.status === "active" : view === "attention" ? row.attention : view === "paused" ? row.status === "paused" : view === "ended" ? row.status === "ended" : true).sort((a, b) => (a.nextDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.nextDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const activeRows = rows.filter((row) => row.status === "active" || row.status === "trialing");
  const attentionRows = rows.filter((row) => row.attention);
  const mrr = activeRows.reduce((sum, row) => sum + row.amount, 0);
  const cardCount = rows.filter((row) => row.kind === "card" && ["active", "trialing"].includes(row.status)).length;
  const manualCount = rows.filter((row) => row.kind === "manual" && row.status === "active").length;

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Billing / Subscriptions</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Subscriptions</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">One operational view for automatic card billing and manual invoice subscriptions.</p></div><div className="flex flex-wrap gap-2"><Link href="/admin/subscriptions/new" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Create subscription</Link><Link href="/admin/subscription-options" className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Manage plans</Link></div></div>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Estimated MRR</p><p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-950 dark:text-emerald-100">{formatExpenseAmount(mrr, "XCD")}</p><p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">Active recurring value</p></div><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active subscriptions</p><p className="mt-2 text-2xl font-semibold tabular-nums">{activeRows.length}</p><p className="mt-1 text-xs text-zinc-500">{cardCount} card · {manualCount} manual</p></div><div className={`rounded-xl border p-4 ${attentionRows.length ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Needs attention</p><p className="mt-2 text-2xl font-semibold tabular-nums">{attentionRows.length}</p><p className="mt-1 text-xs text-zinc-500">Past due, paused, or renewing soon</p></div><div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Collection mix</p><p className="mt-2 text-lg font-semibold">{cardCount} auto / {manualCount} manual</p><p className="mt-1 text-xs text-blue-800/80 dark:text-blue-300/80">Stripe card and invoice tracks</p></div></section>
    <WorkQueueToolbar basePath="/admin/subscriptions" query={query} placeholder="Search customer or email" activeView={view} views={[{ id: "all", label: "All" }, { id: "active", label: "Active" }, { id: "attention", label: "Attention" }, { id: "card", label: "Card autocharge" }, { id: "manual", label: "Manual invoice" }, { id: "paused", label: "Paused" }, { id: "ended", label: "Ended" }]} />
    {rows.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">{query ? "No subscriptions match this search." : "No subscriptions in this view."}</p> : <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Collection</th><th className="px-4 py-3">Plan / quantity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Next renewal</th><th className="px-4 py-3 text-right">MRR</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={`${row.kind}-${row.id}`} className={row.attention ? "bg-amber-50/30 dark:bg-amber-950/10" : undefined}><td className="px-4 py-3 font-medium"><Link href={row.href} className="text-emerald-700 hover:underline dark:text-emerald-400">{row.customer}</Link>{row.email ? <p className="text-xs font-normal text-zinc-500">{row.email}</p> : null}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.kind === "card" ? "bg-blue-100 text-blue-800" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>{row.kind === "card" ? "Card autocharge" : "Manual invoice"}</span></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.plan}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.attention ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{row.statusLabel}</span></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.nextDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "-"}</td><td className="px-4 py-3 text-right tabular-nums">{formatExpenseAmount(row.amount, row.currency)}</td><td className="px-4 py-3 text-right"><Link href={row.href} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>)}</tbody></table></div>}
  </div>;
}
