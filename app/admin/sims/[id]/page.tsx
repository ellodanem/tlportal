import Link from "next/link";
import { notFound } from "next/navigation";

import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { SimSyncButton } from "@/components/admin/sim/sim-sync-button";
import { SimUsageRangeControls } from "@/components/admin/sim/sim-usage-range-controls";
import { UsageLineChart } from "@/components/admin/sim/usage-line-chart";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { formatMegabytes } from "@/lib/format/mbytes";
import { ONE_NCE_CUSTOMER_PORTAL_DASHBOARD } from "@/lib/nce/portal-urls";
import {
  fetchMergedSimFieldsForIccid,
  fetchOneNceSimUsageSeries,
  summarizeUsageSeries,
  type UsageSeriesPoint,
} from "@/lib/nce/sim-api";
import { resolveSimUsageRangeFromQuery } from "@/lib/nce/sim-usage-range";
import { prisma } from "@/lib/db";
import { formatPlanTerm } from "@/lib/subscription-options/display";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ usageFrom?: string; usageTo?: string }>;
};

function formatDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUsageDay(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function assignmentStatusPill(status: string) {
  const base = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize";
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    due_soon: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    overdue: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200",
    suspended: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
    cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span className={`${base} ${map[status] ?? map.suspended}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function AdminSimDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const sim = await prisma.simCard.findUnique({
    where: { id },
    include: {
      device: {
        include: { deviceModel: true },
      },
      serviceAssignments: {
        orderBy: { startDate: "desc" },
        include: {
          customer: true,
          device: { include: { deviceModel: true } },
        },
      },
    },
  });

  if (!sim) {
    notFound();
  }

  const isOneNce = sim.source === "1nce";
  const oneNceConfigured = isOneNce && Boolean(
    process.env.ONCE_CLIENT_ID?.trim() && process.env.ONCE_CLIENT_SECRET?.trim(),
  );

  let usagePoints: UsageSeriesPoint[] = [];
  let liveTotalMb: number | null = null;
  let liveUsedMb: number | null = null;
  const usageRange = resolveSimUsageRangeFromQuery({
    usageFrom: sp.usageFrom,
    usageTo: sp.usageTo,
  });

  if (oneNceConfigured) {
    const [usageOutcome, mergedOutcome] = await Promise.allSettled([
      fetchOneNceSimUsageSeries(sim.iccid, usageRange.start, usageRange.end),
      fetchMergedSimFieldsForIccid(sim.iccid),
    ]);
    if (usageOutcome.status === "fulfilled") {
      usagePoints = usageOutcome.value;
    }
    if (mergedOutcome.status === "fulfilled") {
      liveTotalMb = mergedOutcome.value.totalDataMB;
      liveUsedMb = mergedOutcome.value.usedDataMB;
    }
  }

  const displayTotalMb = liveTotalMb ?? sim.totalDataMB;
  const displayUsedMb = liveUsedMb ?? sim.usedDataMB;
  const quotaPercent =
    displayUsedMb != null && displayTotalMb != null && displayTotalMb > 0
      ? Math.min(100, Math.max(0, (displayUsedMb / displayTotalMb) * 100))
      : null;
  const quotaRemaining =
    displayUsedMb != null && displayTotalMb != null && displayTotalMb > 0
      ? Math.max(0, displayTotalMb - displayUsedMb)
      : null;
  const providerLabel = sim.source === "manual" ? sim.providerName ?? "Manual provider" : "1NCE";
  const usageSummary = summarizeUsageSeries(usagePoints);

  const title = sim.label?.trim() || sim.iccid;
  const linkedDeviceSummary = sim.device ? (
    <span className="inline-flex items-center justify-end gap-1.5">
      <ObjectTypeIcon
        type={sim.device.objectType}
        className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
      />
      <span>
        {sim.device.label?.trim() || sim.device.imei} · {sim.device.deviceModel.name}
      </span>
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/admin/sims"
            prefetch={false}
            className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← SIM cards
          </Link>
          <h1 className="mt-2 break-all font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
            {title}
          </h1>
          {sim.label?.trim() ? (
            <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{sim.iccid}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">{providerLabel}</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">{sim.status || "Unknown"} · provider status</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${sim.device ? "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"}`}>{sim.device ? "Linked to device" : "Unlinked"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          {isOneNce ? <SimSyncButton simId={sim.id} /> : null}
          {isOneNce ? <a
            href={ONE_NCE_CUSTOMER_PORTAL_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
          >
            1NCE dashboard ↗
          </a> : null}
        </div>
      </div>

      <nav className="-mt-2 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800" aria-label="SIM detail sections">
        {[['overview', 'Overview'], ['usage', 'Usage'], ['assignments', 'Assignments'], ['history', 'History']].map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-zinc-600 hover:border-emerald-300 hover:text-emerald-800 dark:text-zinc-400 dark:hover:text-emerald-300">{label}</a>)}
      </nav>

      {sim.device ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/90 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
          <ObjectTypeIcon
            type={sim.device.objectType}
            className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400"
          />
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Linked device</span>
          <UsagePurposeBadge purpose={sim.device.usagePurpose} />
          {sim.device.usagePurpose === "customer" ? (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Production</span>
          ) : null}
          {sim.device.tags.length > 0 ? (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{sim.device.tags.join(" · ")}</span>
          ) : null}
          <Link
            href={`/admin/devices/${sim.device.id}/edit`}
            className="ml-auto text-xs font-medium text-emerald-700 underline decoration-emerald-600/30 hover:decoration-emerald-700 dark:text-emerald-400"
          >
            Edit purpose
          </Link>
        </div>
      ) : null}

      <section id="overview" className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Provider-reported data allowance</h2>
          {quotaPercent != null ? <><p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">{formatMegabytes(displayUsedMb, 2)} <span className="text-xl text-zinc-400">/ {formatMegabytes(displayTotalMb, 0)}</span></p><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${quotaPercent}%` }} /></div><dl className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800"><div className="flex justify-between gap-3 py-2"><dt className="text-zinc-500">Used · reported quota</dt><dd className="font-medium tabular-nums">{quotaPercent.toFixed(1)}%</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-zinc-500">Remaining · reported quota</dt><dd className="font-medium tabular-nums">{formatMegabytes(quotaRemaining, 2)}</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-zinc-500">Last successful snapshot</dt><dd className="font-medium">{formatDateTime(sim.lastSyncedAt)}</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-zinc-500">Plan reset period</dt><dd className="font-medium">Not recorded</dd></div></dl></> : <p className="mt-5 rounded-lg bg-zinc-50 px-4 py-5 text-sm text-zinc-600 dark:bg-zinc-950/50 dark:text-zinc-400">No provider quota snapshot is available for this SIM.</p>}
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">This is a provider quota snapshot. It is not labelled monthly usage without verified plan or reset metadata.</p>
        </div>
        <div id="usage" className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Usage over time</h2>
          {oneNceConfigured ? (
            <>
              <div className="mt-3">
                <SimUsageRangeControls
                  simId={sim.id}
                  usageFrom={usageRange.usageFrom}
                  usageTo={usageRange.usageTo}
                  isDefaultRange={!usageRange.usedQueryParams}
                />
              </div>
              <dl className="mt-3 grid gap-2 rounded-lg bg-zinc-50/90 px-3 py-2.5 text-xs dark:bg-zinc-950/50">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">First day with usage</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                    {usageSummary.firstUsageDate ? formatUsageDay(usageSummary.firstUsageDate) : "None in this window"}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">Total in window</dt>
                  <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatMegabytes(usageSummary.totalMbInRange)}
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
          <div className="mt-4">
            <UsageLineChart points={usagePoints} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">SIM and network</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Source</dt>
              <dd className="text-right font-medium text-zinc-900 dark:text-zinc-50">{sim.source === "manual" ? `Manual · ${sim.providerName ?? "provider unknown"}` : "1NCE API"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Status</dt>
              <dd className="text-right font-medium text-zinc-900 dark:text-zinc-50">{sim.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">MSISDN</dt>
              <dd className="text-right font-mono text-zinc-900 dark:text-zinc-50">{sim.msisdn ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">IMSI</dt>
              <dd className="break-all text-right font-mono text-zinc-900 dark:text-zinc-50">{sim.imsi ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Data</dt>
              <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatMegabytes(displayUsedMb)} / {formatMegabytes(displayTotalMb)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Data expiry</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-50">{formatDateTime(sim.dataExpiryDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Last synced</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-50">{formatDateTime(sim.lastSyncedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Linked device</dt>
              <dd className="max-w-[60%] text-right text-zinc-900 dark:text-zinc-50">
                {linkedDeviceSummary ?? "—"}
              </dd>
            </div>
          </dl>
          {!oneNceConfigured ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              1NCE is not configured (set ONCE_CLIENT_ID and ONCE_CLIENT_SECRET). Sync and usage charts require API
              access.
            </p>
          ) : null}
        </div>

        <div id="assignments" className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Current device &amp; history</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Current links and recorded service associations.</p>
          <ul className="mt-4 space-y-3">
            {sim.serviceAssignments.length === 0 ? (
              <li className="text-sm text-zinc-500 dark:text-zinc-400">No assignments.</li>
            ) : (
              sim.serviceAssignments.map((a) => {
                const custName = customerDisplayName(a.customer);
                const dev = (
                  <span className="inline-flex items-center gap-1.5">
                    <ObjectTypeIcon
                      type={a.device.objectType}
                      className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                    />
                    <span>
                      {a.device.label?.trim() || a.device.imei} · {a.device.deviceModel.name}
                    </span>
                  </span>
                );
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/admin/customers/${a.customerId}`}
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        {custName}
                      </Link>
                      {assignmentStatusPill(a.status)}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{dev}</p>
                    <div className="mt-3 flex flex-wrap gap-2"><Link href={`/admin/devices/${a.device.id}/edit`} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-white dark:border-zinc-700 dark:text-zinc-100">View device →</Link><Link href={`/admin/customers/${a.customerId}`} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-white dark:border-zinc-700 dark:text-zinc-100">View customer →</Link></div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Term:</span>{" "}
                      {a.intervalMonths != null ? formatPlanTerm(a.intervalMonths) : "—"}
                      {" · "}
                      <Link
                        href={`/admin/devices/${a.device.id}/edit?tab=assignment`}
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        Billing &amp; dates
                      </Link>
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-zinc-400">{a.id}</p>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div id="history" className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">Provider &amp; history</h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-200/90">
            Manage SIM lifecycle, data plans, and organization settings in the 1NCE customer portal.
          </p>
          <a
            href={ONE_NCE_CUSTOMER_PORTAL_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-emerald-800 underline decoration-emerald-600/40 underline-offset-2 hover:decoration-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            Open 1NCE dashboard →
          </a>
        </div>
      </section>
    </div>
  );
}
