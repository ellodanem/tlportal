import Link from "next/link";
import { notFound } from "next/navigation";

import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { SimSyncButton } from "@/components/admin/sim/sim-sync-button";
import { DataUsageDonut } from "@/components/admin/sim/data-usage-donut";
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
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

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

export default async function AdminSimDetailPage({ params }: Props) {
  const { id } = await params;
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

  const oneNceConfigured = Boolean(
    process.env.ONCE_CLIENT_ID?.trim() && process.env.ONCE_CLIENT_SECRET?.trim(),
  );

  let usagePoints: UsageSeriesPoint[] = [];
  let liveTotalMb: number | null = null;
  let liveUsedMb: number | null = null;
  if (oneNceConfigured) {
    const end = new Date();
    const start = new Date();
    // 1NCE usage API is bounded (~6 months); use a wide window so “first day with usage” is meaningful for newer SIMs.
    start.setDate(start.getDate() - 180);
    const [usageOutcome, mergedOutcome] = await Promise.allSettled([
      fetchOneNceSimUsageSeries(sim.iccid, start, end),
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
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <SimSyncButton simId={sim.id} />
          <a
            href={ONE_NCE_CUSTOMER_PORTAL_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
          >
            1NCE dashboard ↗
          </a>
        </div>
      </div>

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

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Data allowance</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Used vs included quota from the last sync.</p>
          <div className="mt-4">
            <DataUsageDonut usedMb={displayUsedMb} totalMb={displayTotalMb} />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Usage over time</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Daily data from 1NCE (up to ~6 months). First activity below is the earliest day with reported usage in this
            window—not the exact moment the SIM attached to the network.
          </p>
          {oneNceConfigured ? (
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
          ) : null}
          <div className="mt-4">
            <UsageLineChart points={usagePoints} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">SIM and network</h2>
          <dl className="mt-4 space-y-3 text-sm">
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

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Assignments</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Services tied to this SIM.</p>
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
                    <p className="mt-1 font-mono text-[10px] text-zinc-400">{a.id}</p>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">1NCE portal</h2>
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
