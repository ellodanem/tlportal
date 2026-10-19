import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import {
  FleetSnapshot,
  FLEET_SEGMENT_ORDER,
  type FleetSnapshotRow,
} from "@/components/dashboard/fleet-snapshot";
import { FleetHealthSummary } from "@/components/dashboard/fleet-health-summary";
import { ServiceActivationTrend } from "@/components/dashboard/service-activation-trend";
import { StatCard, type StatBadge } from "@/components/dashboard/stat-card";
import {
  IconAlert,
  IconDataUsage,
  IconDevice,
  IconLayers,
  IconSearch,
} from "@/components/dashboard/dashboard-icons";
import { getDashboardStats } from "@/lib/admin/dashboard-stats";
import { formatReportMoney } from "@/lib/domain/billing-reports";
import { formatMegabytes } from "@/lib/format/mbytes";

type AttentionTone = "urgent" | "warning" | "info";

function attentionToneClass(tone: AttentionTone) {
  switch (tone) {
    case "urgent":
      return "border-l-4 border-l-rose-500 bg-rose-50/45 dark:bg-rose-950/20";
    case "warning":
      return "border-l-4 border-l-amber-500 bg-amber-50/45 dark:bg-amber-950/20";
    default:
      return "border-l-4 border-l-sky-500 bg-sky-50/45 dark:bg-sky-950/20";
  }
}

export default async function AdminPage() {
  const s = await getDashboardStats();

  const fleetRows: FleetSnapshotRow[] = FLEET_SEGMENT_ORDER.map((key) => ({
    key,
    count: s.fleetSegments[key],
  })).filter((row) => row.count > 0);
  const totalDevices = FLEET_SEGMENT_ORDER.reduce((sum, key) => sum + s.fleetSegments[key], 0);

  const simBadges: StatBadge[] = [];
  if (s.simsOverDataLimitCount > 0) {
    simBadges.push({ label: `${s.simsOverDataLimitCount} over limit`, variant: "rose" });
  }
  if (s.simCardCount > 0) {
    simBadges.push({ label: `${s.simCardCount} tracked`, variant: "neutral" });
  }

  const mrrUnavailable = s.canonicalMrrUnavailableCount > 0 && s.monthlyRecurringRevenueXcd === 0;
  const mrrBadges: StatBadge[] = [];
  if (s.canonicalMrrUnavailableCount > 0) {
    mrrBadges.push({ label: `${s.canonicalMrrUnavailableCount} needs rate review`, variant: "amber" });
  }
  if (s.nonXcdRecurringSourceCount > 0) {
    mrrBadges.push({ label: `${s.nonXcdRecurringSourceCount} non-XCD excluded`, variant: "neutral" });
  }

  const balanceBadges: StatBadge[] = [];
  if (s.overdueInvoiceCount > 0) {
    balanceBadges.push({ label: `${s.overdueInvoiceCount} overdue`, variant: "rose" });
  }
  if (s.nonXcdOutstandingInvoiceCount > 0) {
    balanceBadges.push({ label: `${s.nonXcdOutstandingInvoiceCount} non-XCD excluded`, variant: "neutral" });
  }

  const operationalAttention: { title: string; detail: string; href: string; tone: AttentionTone }[] = [];
  if (s.overdueInvoiceCount > 0) {
    operationalAttention.push({
      title: `${s.overdueInvoiceCount} overdue invoice${s.overdueInvoiceCount === 1 ? "" : "s"}`,
      detail: `${formatReportMoney(s.outstandingBalanceXcd)} open XCD balance across ${s.outstandingInvoiceCount} invoice${s.outstandingInvoiceCount === 1 ? "" : "s"}`,
      href: "/admin/tl-invoices",
      tone: "urgent",
    });
  }
  if (s.simsHighUsageCount > 0) {
    operationalAttention.push({
      title: `${s.simsHighUsageCount} SIM${s.simsHighUsageCount === 1 ? "" : "s"} at 90% data use`,
      detail: `${s.simsNearDataLimitCount} SIM${s.simsNearDataLimitCount === 1 ? "" : "s"} are approaching their allowance`,
      href: "/admin/sims",
      tone: s.simsOverDataLimitCount > 0 ? "urgent" : "warning",
    });
  }
  if (s.devicesInventoryLow || s.simsInventoryLow) {
    operationalAttention.push({
      title: "Inventory needs replenishment",
      detail: `${s.inStockDeviceCount} in-stock device${s.inStockDeviceCount === 1 ? "" : "s"} · ${s.availableSimCount} unassigned SIM${s.availableSimCount === 1 ? "" : "s"} (low-stock threshold: ${s.lowInventoryThreshold})`,
      href: "/admin/devices",
      tone: "warning",
    });
  }
  if (s.paymentIssueCount > 0 || s.canonicalMrrUnavailableCount > 0) {
    operationalAttention.push({
      title: "Billing exceptions need review",
      detail: [
        s.paymentIssueCount > 0 ? `${s.paymentIssueCount} payment or past-due signal${s.paymentIssueCount === 1 ? "" : "s"}` : null,
        s.canonicalMrrUnavailableCount > 0 ? `${s.canonicalMrrUnavailableCount} canonical rate configuration${s.canonicalMrrUnavailableCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join(" · "),
      href: "/admin/billing-health",
      tone: "warning",
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Track Lucia · business performance</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Operations overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              A live operational view of deployed services, recurring revenue, receivables, SIM consumption, and ready-to-install equipment.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-200">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Live read-only reporting
            </span>
            <Link href="/admin/customers" className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800">
              <IconSearch className="h-4 w-4" />
              Browse customers
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key performance indicators">
        <StatCard label="Active GPS services" value={s.activeServiceCount} href="/admin/customers" accent="emerald" icon={<IconLayers className="h-5 w-5" />} hint="Deployed, non-suspended service assignments for active customers" />
        <StatCard label="Monthly recurring revenue" value={mrrUnavailable ? "—" : formatReportMoney(s.monthlyRecurringRevenueXcd)} href="/admin/billing-health" accent="sky" icon={<IconLayers className="h-5 w-5" />} badges={mrrBadges.length ? mrrBadges : undefined} hint={mrrUnavailable ? "No complete XCD recurring-rate source is available" : "Normalized across legacy, canonical, and standalone recurring schedules"} />
        <StatCard label="Outstanding invoice balances" value={formatReportMoney(s.outstandingBalanceXcd)} href="/admin/tl-invoices" accent={s.overdueInvoiceCount > 0 ? "rose" : "violet"} icon={<IconAlert className="h-5 w-5" />} badges={balanceBadges.length ? balanceBadges : undefined} hint={`${s.outstandingInvoiceCount} open XCD invoice${s.outstandingInvoiceCount === 1 ? "" : "s"}`} />
        <StatCard label="SIMs near data limit" value={s.simsNearDataLimitCount} href="/admin/sims" accent={s.simsHighUsageCount > 0 ? "amber" : "cyan"} icon={<IconDataUsage className="h-5 w-5" />} badges={simBadges.length ? simBadges : undefined} hint="Uses synced allowance and usage; approaching starts at 80%" />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Service activation trend</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">New service-assignment records created each month. This is an operational trend, not an estimated revenue history.</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Last 6 months</span>
          </div>
          <div className="mt-5"><ServiceActivationTrend points={s.serviceTrend} /></div>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Available equipment</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Ready inventory for the next installation.</p>
            </div>
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.devicesInventoryLow || s.simsInventoryLow ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}><IconDevice className="h-5 w-5" /></span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/40"><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Devices</dt><dd className="mt-2 text-3xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{s.inStockDeviceCount}</dd><dd className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">in stock</dd></div>
            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/40"><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">SIM cards</dt><dd className="mt-2 text-3xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{s.availableSimCount}</dd><dd className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">unassigned</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium"><Link href="/admin/devices" className="text-emerald-700 hover:underline dark:text-emerald-400">Manage devices →</Link><Link href="/admin/sims" className="text-emerald-700 hover:underline dark:text-emerald-400">Manage SIMs →</Link></div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Requires attention</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Prioritized operational signals with direct links to the current admin workflows.</p></div>
          <Link href="/admin/billing-health" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open billing health →</Link>
        </div>
        {operationalAttention.length === 0 && s.attentionItems.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-7 text-center text-sm text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-100">No overdue invoices, high SIM usage, low inventory, or billing exceptions are currently surfaced.</div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {operationalAttention.map((item) => <Link key={item.title} href={item.href} className={`rounded-xl border border-zinc-100 p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 ${attentionToneClass(item.tone)}`}><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{item.title}</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.detail}</p><span className="mt-3 inline-block text-xs font-medium text-emerald-700 dark:text-emerald-400">Review →</span></Link>)}
            {s.attentionItems.slice(0, 4).map((item) => <Link key={item.id} href={item.href} className={`rounded-xl border border-zinc-100 p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 ${attentionToneClass(item.tone)}`}><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{item.title}</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.meta}</p><span className="mt-3 inline-block text-xs font-medium text-emerald-700 dark:text-emerald-400">Open →</span></Link>)}
          </div>
        )}
      </section>

      <FleetHealthSummary counts={s.fleetHealth.counts} title="Fleet health" subtitle="Open service assignments across active customer accounts (operational signals, not live GPS telemetry)" generatedAt={new Date()} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Fleet snapshot</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Device inventory by fleet segment ({totalDevices.toLocaleString()} total).</p><FleetSnapshot rows={fleetRows} totalDevices={totalDevices} /></div>
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Recent customer activity</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Latest customer record updates.</p><ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{s.recentItems.length === 0 ? <li className="py-6 text-sm text-zinc-500 dark:text-zinc-400">No customer activity yet.</li> : s.recentItems.map((item) => <li key={item.id}><Link href={item.href} className="block py-3 transition hover:text-emerald-700 dark:hover:text-emerald-400"><p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.label}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.sub} · {formatDistanceToNow(item.at, { addSuffix: true })}</p></Link></li>)}</ul></div>
      </section>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">SIM usage is based on the last synced 1NCE allowance data: {formatMegabytes(s.simUsedSumMb)} used of {formatMegabytes(s.simTotalSumMb)} reported. <Link href="/" className="text-emerald-700 hover:underline dark:text-emerald-400">Public home →</Link></p>
    </div>
  );
}
