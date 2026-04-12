import { ImportSimsButton } from "@/components/admin/sim/import-sims-button";
import { SimsTableClient } from "@/components/admin/sim/sims-table-client";
import { ONE_NCE_CUSTOMER_PORTAL_DASHBOARD } from "@/lib/nce/portal-urls";
import type { SimListRow } from "@/lib/admin/sim-list-filter";
import { prisma } from "@/lib/db";

/** Usage totals change after sync/import; avoid serving a stale full-route cache for this page. */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ usage?: string; avg?: string }> };

function parseAvgWindowDays(avg: string | undefined): 7 | 30 | 90 {
  if (avg === "7") return 7;
  if (avg === "90") return 90;
  return 30;
}

export default async function AdminSimsPage({ searchParams }: Props) {
  const { usage: usageParam, avg: avgParam } = await searchParams;
  const usageLowFirst = usageParam === "asc";
  const avgWindowDays = parseAvgWindowDays(avgParam);

  const sims = await prisma.simCard.findMany({
    orderBy: [
      {
        usedDataMB: {
          sort: usageLowFirst ? "asc" : "desc",
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

  return (
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
      usageLowFirst={usageLowFirst}
      avgWindowDays={avgWindowDays}
      headerActions={
        <>
          <ImportSimsButton />
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
  );
}
