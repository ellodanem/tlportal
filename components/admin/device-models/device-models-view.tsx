"use client";

import Link from "next/link";

import {
  NewDeviceModelModalProvider,
  NewModelButton,
  useOpenNewDeviceModelModal,
} from "@/components/admin/device-models/new-device-model-modal";

export type DeviceModelTableRow = {
  id: string;
  name: string;
  manufacturer: string | null;
  category: string | null;
  retail: string;
  cost: string;
  isActive: boolean;
  deviceCount: number;
};

const btnClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400";

function EmptyCreateLink({ children }: { children: React.ReactNode }) {
  const open = useOpenNewDeviceModelModal();
  return (
    <button type="button" onClick={open} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
      {children}
    </button>
  );
}

export function DeviceModelsView({ models }: { models: DeviceModelTableRow[] }) {
  return (
    <NewDeviceModelModalProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Device models</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Product catalog for trackers and gateways. Only <strong>active</strong> models appear on{" "}
              <Link
                href="/admin/devices/new"
                className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Register device
              </Link>
              .
            </p>
          </div>
          <NewModelButton className={btnClass} />
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Retail</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Devices</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                    No models yet. <EmptyCreateLink>Create one</EmptyCreateLink>.
                  </td>
                </tr>
              ) : (
                models.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">{m.name}</p>
                      {m.manufacturer?.trim() ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.manufacturer.trim()}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{m.category?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{m.retail}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{m.cost}</td>
                    <td className="px-4 py-3">
                      {m.isActive ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {m.deviceCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/device-models/${m.id}/edit`}
                        className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </NewDeviceModelModalProvider>
  );
}
