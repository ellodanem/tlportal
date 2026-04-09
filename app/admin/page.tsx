import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { StatCard } from "@/components/dashboard/stat-card";
import { IconAlert, IconDevice, IconLayers, IconLink, IconSearch, IconUsers } from "@/components/dashboard/dashboard-icons";
import { DEVICE_STATUS_LABEL } from "@/lib/admin/device-status-labels";
import { getDashboardStats } from "@/lib/admin/dashboard-stats";

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

export default async function AdminPage() {
  const s = await getDashboardStats();

  const assignedBadges: { label: string; variant: "neutral" | "amber" | "rose" }[] = [
    { label: `In stock · ${s.inStockDeviceCount}`, variant: "neutral" },
  ];
  if (s.suspendedDeviceCount > 0) {
    assignedBadges.push({ label: `Suspended · ${s.suspendedDeviceCount}`, variant: "amber" });
  }

  const invoilessBadges =
    s.invoilessConfigured && s.unlinkedInvoilessCount > 0
      ? [{ label: `Pending link · ${s.unlinkedInvoilessCount}`, variant: "amber" as const }]
      : undefined;

  const attentionBadges =
    s.attentionCount > 0
      ? [
          ...(s.overdueAssignmentCount > 0
            ? [{ label: `Overdue svc · ${s.overdueAssignmentCount}`, variant: "rose" as const }]
            : []),
          ...(s.dueSoonAssignmentCount > 0
            ? [{ label: `Due soon · ${s.dueSoonAssignmentCount}`, variant: "amber" as const }]
            : []),
          ...(s.invoilessConfigured && s.unlinkedInvoilessCount > 0
            ? [{ label: `Invoiless · ${s.unlinkedInvoilessCount}`, variant: "slate" as const }]
            : []),
        ]
      : undefined;

  const fleetOrder = ["in_stock", "assigned", "suspended", "returned", "decommissioned", "lost"] as const;
  const fleetRows = fleetOrder
    .map((key) => ({
      key,
      label: DEVICE_STATUS_LABEL[key] ?? key,
      count: s.fleetByStatus[key] ?? 0,
    }))
    .filter((r) => r.count > 0);

  const totalDevices = Object.values(s.fleetByStatus).reduce<number>((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {/* Breadcrumb + title */}
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Dashboard</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Operations overview
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Customers, assigned hardware, and billing signals in one place. Tiles link through to detail where routes exist.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/customers"
          className="flex w-full max-w-md items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:text-zinc-300 sm:w-auto"
        >
          <IconSearch className="shrink-0 opacity-60" />
          <span>Search or browse customers…</span>
        </Link>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800/80">
            Live data
          </span>
          <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800/80">
            Device registry live · SIMs on{" "}
            <Link href="/admin/sims" className="text-emerald-700 hover:underline dark:text-emerald-400">
              SIM cards
            </Link>
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Customers"
          value={s.customerCount}
          href="/admin/customers"
          icon={<IconUsers className="h-5 w-5" />}
          hint="Accounts in TL Portal"
        />
        <StatCard
          label="Assigned devices"
          value={s.assignedDeviceCount}
          href="/admin/devices"
          icon={<IconDevice className="h-5 w-5" />}
          badges={assignedBadges}
          hint="In the field vs warehouse (badges)"
        />
        <StatCard
          label="Active services"
          value={s.activeServiceCount}
          href="/admin/customers"
          icon={<IconLayers className="h-5 w-5" />}
          hint="Open assignments (not ended / cancelled)"
        />
        <StatCard
          label={s.invoilessConfigured ? "Invoiless linked" : "Invoiless"}
          value={s.invoilessConfigured ? s.linkedInvoilessCount : "—"}
          href="/admin/customers"
          icon={<IconLink className="h-5 w-5" />}
          badges={invoilessBadges}
          hint={
            s.invoilessConfigured
              ? "Customers with a stored Invoiless id"
              : "Set INVOILESS_API_KEY to enable sync & counts"
          }
        />
        <StatCard
          label="Needs attention"
          value={s.attentionCount}
          href={s.attentionItems[0]?.href ?? "/admin/customers"}
          icon={<IconAlert className="h-5 w-5" />}
          badges={attentionBadges}
          hint="Overdue / due-soon services + unlinked Invoiless"
        />
      </section>

      {/* Important notifications */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              <IconAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Needs attention</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Exceptions across services and Invoiless linkage
              </p>
            </div>
          </div>
          {s.attentionCount > 0 ? (
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              {s.attentionCount} open
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              All clear
            </span>
          )}
        </div>

        <ul className="mt-4 space-y-3">
          {s.attentionItems.length === 0 ? (
            <li className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-zinc-400">
              No overdue services or Invoiless gaps surfaced. Data will populate as you add assignments and sync
              billing.
            </li>
          ) : (
            s.attentionItems.map((item) => (
              <li
                key={item.id}
                className={`flex flex-col gap-3 rounded-xl border border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800/80 ${toneRowClass(item.tone)}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{item.meta}</p>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                  Open
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Bottom row */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Fleet snapshot</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Device inventory by status ({totalDevices.toLocaleString()} total)
          </p>
          {totalDevices === 0 ? (
            <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
              No devices yet.{" "}
              <Link href="/admin/devices" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Open devices
              </Link>{" "}
              to register trackers when you are ready.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {fleetRows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-700 dark:text-zinc-300">{row.label}</span>
                  <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-50">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent activity</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Latest customer record updates</p>
          <ul className="mt-4 space-y-3">
            {s.recentItems.length === 0 ? (
              <li className="text-sm text-zinc-600 dark:text-zinc-400">No customers yet.</li>
            ) : (
              s.recentItems.map((r) => (
                <li key={r.id}>
                  <Link href={r.href} className="group block rounded-lg p-2 -m-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <p className="text-sm font-medium text-zinc-900 group-hover:text-emerald-700 dark:text-zinc-50 dark:group-hover:text-emerald-400">
                      {r.label}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {r.sub} · {formatDistanceToNow(r.at, { addSuffix: true })}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Public home
        </Link>
      </p>
    </div>
  );
}
