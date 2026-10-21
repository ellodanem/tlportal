import { ImportSimsButton } from "@/components/admin/sim/import-sims-button";
import Link from "next/link";
import { SimsTableClient } from "@/components/admin/sim/sims-table-client";
import { ONE_NCE_CUSTOMER_PORTAL_DASHBOARD } from "@/lib/nce/portal-urls";
import type { SimListRow } from "@/lib/admin/sim-list-filter";
import { prisma } from "@/lib/db";

/** Usage totals change after sync/import; avoid serving a stale full-route cache for this page. */
export const dynamic = "force-dynamic";

export default async function AdminSimsPage() {

  const sims = await prisma.simCard.findMany({
    orderBy: [
      {
        usedDataMB: {
          sort: "desc",
          nulls: "last",
        },
      },
      { updatedAt: "desc" },
    ],
    include: {
      device: {
        include: { deviceModel: true },
      },
    },
  });

  const rows: SimListRow[] = sims.map((sim) => ({
    id: sim.id,
    iccid: sim.iccid,
    label: sim.label,
    providerName: sim.providerName,
    source: sim.source,
    lastSyncedAt: sim.lastSyncedAt,
    status: sim.status,
    usedDataMB: sim.usedDataMB,
    totalDataMB: sim.totalDataMB,
    deviceUsagePurpose: sim.device?.usagePurpose ?? null,
    deviceTags: sim.device?.tags ?? [],
    device: sim.device
      ? {
          label: sim.device.label,
          imei: sim.device.imei,
          deviceModel: { name: sim.device.deviceModel.name },
        }
      : null,
  }));

  const linked = rows.filter((sim) => sim.device).length;
  const eligible = rows.filter((sim) => !sim.device).length;
  const attention = rows.filter((sim) => !sim.totalDataMB || !sim.lastSyncedAt).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Total SIMs", rows.length, "All recorded SIM inventory"], ["Eligible / unlinked", eligible, "Unlinked; final eligibility is rechecked on assignment"], ["Linked / in use", linked, "Currently linked to a device"], ["Usage or sync attention", attention, "Missing quota or no sync snapshot"]].map(([label, value, hint]) => <section key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p><p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p></section>)}
      </div>
    <SimsTableClient
      intro={
        <>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SIM cards</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Use <strong className="font-medium text-zinc-700 dark:text-zinc-300">Import SIMs from 1NCE</strong> to load
            inventory into TL Portal, then open a row for usage and assignments.
          </p>
        </>
      }
      rows={rows}
      headerActions={
        <>
          <ImportSimsButton />
          <Link href="/admin/sims/new" className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500">
            + Add SIM manually
          </Link>
          <a
            href={ONE_NCE_CUSTOMER_PORTAL_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center self-start rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40 sm:self-auto"
          >
            1NCE dashboard ↗
          </a>
        </>
      }
    />
    </div>
  );
}
