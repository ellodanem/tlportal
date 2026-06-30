import Link from "next/link";

import { SubscriptionHealthTrendChart } from "@/components/admin/subscription-health-trend-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  IconAlert,
  IconDevice,
  IconLayers,
  IconUsers,
} from "@/components/dashboard/dashboard-icons";
import { formatReportMoney } from "@/lib/domain/billing-reports";
import { getSubscriptionHealthReport } from "@/lib/services/subscription-health-service";

function toneRowClass(tone: "urgent" | "warning" | "info") {
  switch (tone) {
    case "urgent":
      return "border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20";
    case "warning":
      return "border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20";
    default:
      return "border-l-4 border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/20";
  }
}

export default async function AdminBillingHealthPage() {
  const report = await getSubscriptionHealthReport();
  const planMixTotal = report.planMix.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-400 dark:text-zinc-500">Billing</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Health</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Subscription health
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Recurring revenue and renewals across all customers. MRR is normalized to monthly XCD,
          including annual term discounts.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="MRR (XCD)"
          value={formatReportMoney(report.mrrXcd)}
          accent="emerald"
          icon={<IconLayers className="h-5 w-5" />}
          hint="Effective monthly recurring revenue from active Stripe subscriptions and recurring schedules"
        />
        <StatCard
          label="Active subscriptions"
          value={report.activeSubscriptionCount}
          href="/admin/customers"
          accent="sky"
          icon={<IconUsers className="h-5 w-5" />}
          badges={[
            { label: `${report.stripeActiveCount} Stripe`, variant: "sky" },
            { label: `${report.manualActiveCount} manual`, variant: "neutral" },
          ]}
          hint="Stripe card subs plus active recurring invoice schedules"
        />
        <StatCard
          label="Renewals due (7d)"
          value={report.renewalsDueCount}
          href="/admin/customers"
          accent={report.renewalsDueCount > 0 ? "amber" : "zinc"}
          icon={<IconAlert className="h-5 w-5" />}
          hint="Subscription period ends, service renewals, and recurring issue dates"
        />
        <StatCard
          label="Past due"
          value={report.pastDueCount}
          href="/admin/tl-invoices"
          accent={report.pastDueCount > 0 ? "rose" : "zinc"}
          icon={<IconAlert className="h-5 w-5" />}
          hint={`${formatReportMoney(report.pastDueAmountAtRisk)} at risk across overdue subs and invoices`}
        />
        <StatCard
          label="Fleet healthy"
          value={`${report.fleetHealthy} / ${report.fleetTotal}`}
          href="/admin/customers"
          accent="cyan"
          icon={<IconDevice className="h-5 w-5" />}
          hint={`${report.fleetHealthyPct}% of open service assignments are healthy`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">New subscriptions (90 days)</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            CustomerSubscription rows created in the last 90 days (excluding canceled)
          </p>
          <div className="mt-4">
            <SubscriptionHealthTrendChart
              points={report.newSubscriptionsTrend}
              totalLabel={`${report.newSubscriptions90d} new subscription${report.newSubscriptions90d === 1 ? "" : "s"} in the last 90 days`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Attention needed</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Past-due billing, overdue invoices, and renewals due soon
          </p>
          <ul className="mt-4 space-y-3">
            {report.attentionItems.length === 0 ? (
              <li className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-zinc-400">
                Nothing needs attention right now.
              </li>
            ) : (
              report.attentionItems.map((item) => (
                <li key={item.id} className={`rounded-xl border border-zinc-100 p-3 dark:border-zinc-800/80 ${toneRowClass(item.tone)}`}>
                  <Link href={item.href} className="block">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{item.meta}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Plan mix</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Active Stripe subscriptions by billing term
            </p>
          </div>
          <Link
            href="/admin/customers"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            View all customers →
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.planMix.map((row) => {
            const pct = planMixTotal > 0 ? Math.round((row.count / planMixTotal) * 100) : 0;
            return (
              <div
                key={row.planTermMonths}
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/30"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {row.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{row.count}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {planMixTotal > 0 ? `${pct}% of active Stripe subs` : "No active Stripe subs"}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
