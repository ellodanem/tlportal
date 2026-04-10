import type { DeviceStatus } from "@prisma/client";
import Link from "next/link";

/** Colours aligned with fleet semantics (distinct, readable in light & dark UI). */
const FLEET_STATUS_COLOR: Record<DeviceStatus, string> = {
  in_stock: "#a1a1aa",
  assigned: "#059669",
  suspended: "#d97706",
  returned: "#0284c7",
  decommissioned: "#52525b",
  lost: "#e11d48",
};

export type FleetSnapshotRow = {
  key: DeviceStatus;
  label: string;
  count: number;
};

export function FleetSnapshot({
  rows,
  totalDevices,
}: {
  rows: FleetSnapshotRow[];
  totalDevices: number;
}) {
  if (totalDevices === 0) {
    return (
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        No devices yet.{" "}
        <Link href="/admin/devices" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Open devices
        </Link>{" "}
        to register trackers when you are ready.
      </p>
    );
  }

  let cumulativePct = 0;
  const gradientStops = rows.map((row) => {
    const color = FLEET_STATUS_COLOR[row.key] ?? "#737373";
    const pct = (row.count / totalDevices) * 100;
    const start = cumulativePct;
    cumulativePct += pct;
    return `${color} ${start.toFixed(4)}% ${cumulativePct.toFixed(4)}%`;
  });
  const conicBackground = `conic-gradient(${gradientStops.join(", ")})`;

  return (
    <div className="mt-4 flex flex-col items-stretch gap-6 sm:flex-row sm:items-center">
      <div className="flex justify-center sm:justify-start">
        <Link
          href="/admin/devices"
          className="group relative h-36 w-36 shrink-0 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:ring-offset-zinc-900"
          aria-label="Open devices — fleet by status"
        >
          <div
            className="absolute inset-0 rounded-full shadow-inner ring-1 ring-zinc-200/80 transition group-hover:ring-emerald-300/60 dark:ring-zinc-700 dark:group-hover:ring-emerald-700/40"
            style={{ background: conicBackground }}
            aria-hidden
          />
          <div className="absolute inset-[26%] flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
            <span className="text-center text-[11px] font-semibold leading-tight text-zinc-700 dark:text-zinc-200">
              {totalDevices.toLocaleString()}
              <span className="mt-0.5 block font-normal text-zinc-500 dark:text-zinc-400">devices</span>
            </span>
          </div>
        </Link>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {rows.map((row) => {
          const swatch = FLEET_STATUS_COLOR[row.key] ?? "#737373";
          const pct = Math.round((row.count / totalDevices) * 100);
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                  style={{ backgroundColor: swatch }}
                  aria-hidden
                />
                <span className="truncate text-zinc-700 dark:text-zinc-300">{row.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{row.count}</span>
                <span className="ml-1 text-xs">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
