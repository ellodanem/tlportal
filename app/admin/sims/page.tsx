import Link from "next/link";

import { ImportSimsButton } from "@/components/admin/sim/import-sims-button";
import { formatMegabytes } from "@/lib/format/mbytes";
import { ONE_NCE_CUSTOMER_PORTAL_DASHBOARD } from "@/lib/nce/portal-urls";
import { prisma } from "@/lib/db";

function deviceLabel(
  device: {
    label: string | null;
    imei: string;
    deviceModel: { name: string };
  } | null,
) {
  if (!device) return "—";
  const primary = device.label?.trim() || device.imei;
  return `${primary} · ${device.deviceModel.name}`;
}

export default async function AdminSimsPage() {
  const sims = await prisma.simCard.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      device: {
        include: { deviceModel: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SIM cards</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Use <strong className="font-medium text-zinc-700 dark:text-zinc-300">Import SIMs from 1NCE</strong> to load
            inventory into TL Portal, then open a row for usage and assignments.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-start sm:justify-end">
          <ImportSimsButton />
          <a
            href={ONE_NCE_CUSTOMER_PORTAL_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center self-start rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40 sm:self-auto"
          >
            1NCE dashboard ↗
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">ICCID / label</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3 text-right">Used / total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sims.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No SIM cards yet.
                </td>
              </tr>
            ) : (
              sims.map((sim) => (
                <tr key={sim.id} className="transition hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/sims/${sim.id}`}
                      className="group block font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                    >
                      <span className="block font-mono text-xs text-zinc-600 group-hover:text-emerald-700 dark:text-zinc-400 dark:group-hover:text-emerald-300">
                        {sim.iccid}
                      </span>
                      {sim.label?.trim() ? (
                        <span className="mt-0.5 block text-sm text-zinc-900 dark:text-zinc-50">{sim.label.trim()}</span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      {sim.status || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-700 dark:text-zinc-300">{deviceLabel(sim.device)}</td>
                  <td className="px-4 py-3 align-top text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatMegabytes(sim.usedDataMB)} / {formatMegabytes(sim.totalDataMB)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
