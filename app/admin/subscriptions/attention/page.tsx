import Link from "next/link";

import { getSubscriptionHealthReport } from "@/lib/services/subscription-health-service";
import { formatReportMoney } from "@/lib/domain/billing-reports";

function toneClass(tone: "urgent" | "warning" | "info") {
  if (tone === "urgent") return "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20";
  if (tone === "warning") return "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20";
  return "border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/20";
}

export default async function SubscriptionAttentionPage() {
  const report = await getSubscriptionHealthReport();
  const urgent = report.attentionItems.filter((item) => item.tone === "urgent");
  const warning = report.attentionItems.filter((item) => item.tone === "warning");
  const info = report.attentionItems.filter((item) => item.tone === "info");
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <div><Link href="/admin/subscriptions" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Subscriptions</Link><h1 className="mt-3 text-2xl font-semibold tracking-tight">Subscription attention</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">One work queue for failed card collection, overdue manual invoices, and renewals that need a decision.</p></div>
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/20"><p className="text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-300">Urgent</p><p className="mt-2 text-2xl font-semibold tabular-nums text-rose-950 dark:text-rose-100">{urgent.length}</p><p className="mt-1 text-xs text-rose-800/80 dark:text-rose-300/80">Past due or overdue</p></div><div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Upcoming</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">{warning.length}</p><p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">Renewals due soon</p></div><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">At risk</p><p className="mt-2 text-lg font-semibold tabular-nums">{formatReportMoney(report.pastDueAmountAtRisk)}</p><p className="mt-1 text-xs text-zinc-500">Past-due recurring value and open AR</p></div></section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Work queue</h2><p className="mt-1 text-sm text-zinc-500">Open an item to reach the existing billing, invoice, or customer action.</p></div><Link href="/admin/billing-health" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open health report</Link></div><div className="mt-5 flex flex-col gap-3">{report.attentionItems.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">Nothing needs attention right now.</div> : [...urgent, ...warning, ...info].map((item) => <Link key={item.id} href={item.href} className={`rounded-xl border p-4 transition hover:shadow-sm ${toneClass(item.tone)}`}><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.tone === "urgent" ? "Action needed" : item.tone === "warning" ? "Review soon" : "Review"}</span></div><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.meta}</p></Link>)}</div></section>
  </div>;
}
