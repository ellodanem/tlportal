"use client";

import type { DeviceStatus } from "@prisma/client";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useDeferredValue, useMemo, useState } from "react";

import { CopyValueButton } from "@/components/admin/copy-value-button";
import { PurposeScopeFilter } from "@/components/admin/device/purpose-scope-filter";
import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { DEVICE_STATUS_LABEL } from "@/lib/admin/device-status-labels";
import {
  type DevicePurposeScope,
  devicePurposeMatchesScope,
} from "@/lib/admin/device-usage-purpose";
import { type DeviceListRow, deviceMatchesSearchQuery } from "@/lib/admin/device-list";

type SortCol = "status" | "assignedTo";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<DeviceStatus, number> = {
  assigned: 0,
  in_stock: 1,
  suspended: 2,
  returned: 3,
  decommissioned: 4,
  lost: 5,
};

function sortRows(rows: DeviceListRow[], col: SortCol | null, dir: SortDir): DeviceListRow[] {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (col === "status") {
      cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    } else {
      const aName = a.assignedCustomer?.displayName ?? "";
      const bName = b.assignedCustomer?.displayName ?? "";
      if (!aName && bName) return 1;
      if (aName && !bName) return -1;
      cmp = aName.localeCompare(bName);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ col, active, dir }: { col: SortCol; active: SortCol | null; dir: SortDir }) {
  const isActive = active === col;
  return (
    <span className={`ml-1 inline-block transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`} aria-hidden>
      {isActive && dir === "desc" ? "↓" : "↑"}
    </span>
  );
}

function statusPillClass(status: DeviceStatus): string {
  switch (status) {
    case "assigned":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
    case "in_stock":
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
    case "suspended":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    case "returned":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
    case "decommissioned":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
    case "lost":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

type Props = {
  rows: DeviceListRow[];
};

export function DevicesTableClient({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [purposeScope, setPurposeScope] = useState<DevicePurposeScope>("customer_only");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const deferredQuery = useDeferredValue(query);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const base = rows
      .filter((r) => devicePurposeMatchesScope(r.usagePurpose, purposeScope))
      .filter((r) => deviceMatchesSearchQuery(r, deferredQuery));
    return sortRows(base, sortCol, sortDir);
  }, [rows, deferredQuery, purposeScope, sortCol, sortDir]);

  const qTrim = query.trim();
  const showResultHint = qTrim.length > 0 && rows.length > 0 && filtered.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-end">
        <PurposeScopeFilter
          id="device-purpose-scope"
          entityLabel="devices"
          value={purposeScope}
          onChange={setPurposeScope}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor="device-search" className="sr-only">
            Search devices
          </label>
          <input
            id="device-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            placeholder="Search IMEI, serial, model, object type, SIM, customer, tags…"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>
      </div>

      <section
        className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40"
        aria-label="Tracking platform actions (not connected)"
      >
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Tracking platform</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
          Live location, trips, and alerts will appear here when the tracking API is connected.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["Live map", "Trip history", "Alerts"] as const).map((label) => (
            <button
              key={label}
              type="button"
              disabled
              title="Available after API integration"
              className="cursor-not-allowed rounded-lg border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-400 opacity-70 shadow-sm dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-500"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {showResultHint ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {filtered.length} shown
          {filtered.length !== rows.length ? (
            <>
              {" "}
              <span className="text-zinc-400">·</span> filtered from {rows.length}
            </>
          ) : null}{" "}
          for <span className="font-medium text-zinc-800 dark:text-zinc-200">“{qTrim}”</span> ·{" "}
          <button
            type="button"
            onClick={() => setQuery("")}
            className="font-medium text-emerald-700 underline decoration-emerald-600/30 hover:decoration-emerald-700 dark:text-emerald-400"
          >
            Clear filter
          </button>
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Model</th>
              <th className="min-w-[16rem] px-4 py-3">Name &amp; identifiers</th>
              <th className="px-4 py-3 w-24">Manage</th>
              <th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSort("status")}
                  className="group inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Status
                  <SortIcon col="status" active={sortCol} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSort("assignedTo")}
                  className="group inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Assigned to
                  <SortIcon col="assignedTo" active={sortCol} dir={sortDir} />
                </button>
              </th>
              <th className="min-w-[14rem] px-4 py-3">SIM</th>
              <th className="min-w-[11rem] px-4 py-3">Carrier sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No devices yet. Register a device to add trackers to the fleet.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No devices match your search.{" "}
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="font-medium text-emerald-700 underline decoration-emerald-600/30 hover:decoration-emerald-700 dark:text-emerald-400"
                  >
                    Clear filter
                  </button>
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="transition hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                        aria-hidden
                      >
                        {row.modelInitials}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.deviceModel.name}</p>
                        {row.deviceModel.manufacturer?.trim() ? (
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {row.deviceModel.manufacturer.trim()}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="min-w-[16rem] px-4 py-3 align-top">
                    <p className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-50">
                      <ObjectTypeIcon type={row.objectType} className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                      <span>{row.label?.trim() || "Unnamed device"}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="whitespace-nowrap">IMEI {row.imei}</span>
                      <CopyValueButton value={row.imei} kind="IMEI" />
                    </p>
                    {row.serialNumber?.trim() ? (
                      <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-500">
                        S/N {row.serialNumber.trim()}
                      </p>
                    ) : null}
                    {row.firmwareVersion?.trim() ? (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Firmware {row.firmwareVersion.trim()}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/devices/${row.id}/edit`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Manage
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <UsagePurposeBadge purpose={row.usagePurpose} />
                        {row.usagePurpose === "customer" ? (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">Production</span>
                        ) : null}
                      </div>
                      {row.tags.length > 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {row.tags.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusPillClass(row.status)}`}
                    >
                      {DEVICE_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.assignedCustomer ? (
                      <Link
                        href={`/admin/customers/${row.assignedCustomer.id}`}
                        className="group flex items-start gap-2 rounded-lg -m-1 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                          aria-hidden
                        >
                          {row.assignedCustomer.initials}
                        </span>
                        <span className="min-w-0 text-sm font-medium text-emerald-800 group-hover:underline dark:text-emerald-300">
                          {row.assignedCustomer.displayName}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="min-w-[14rem] px-4 py-3 align-top">
                    {row.sim ? (
                      <div className="space-y-0.5 font-mono text-xs">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/admin/sims/${row.sim.id}`}
                            className="text-emerald-800 hover:underline dark:text-emerald-300"
                          >
                            <span className="whitespace-nowrap tabular-nums">{row.sim.iccid}</span>
                          </Link>
                          <CopyValueButton value={row.sim.iccid} kind="ICCID" />
                        </div>
                        {row.sim.msisdn?.trim() ? (
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/admin/sims/${row.sim.id}`}
                              className="text-zinc-600 hover:text-emerald-700 hover:underline dark:text-zinc-400 dark:hover:text-emerald-300"
                            >
                              {row.sim.msisdn.trim()}
                            </Link>
                            <CopyValueButton value={row.sim.msisdn.trim()} kind="MSISDN" />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">No SIM linked</span>
                    )}
                  </td>
                  <td className="min-w-[11rem] whitespace-nowrap px-4 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.sim?.lastSyncedAt ? (
                      <span title={row.sim.lastSyncedAt.toISOString()}>
                        {formatDistanceToNow(row.sim.lastSyncedAt, { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">—</span>
                    )}
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
