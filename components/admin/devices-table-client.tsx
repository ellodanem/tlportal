"use client";

import type { DeviceStatus } from "@prisma/client";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { CopyValueButton } from "@/components/admin/copy-value-button";
import { PurposeScopeFilter } from "@/components/admin/device/purpose-scope-filter";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { DEVICE_STATUS_LABEL } from "@/lib/admin/device-status-labels";
import { type DevicePurposeScope, devicePurposeMatchesScope } from "@/lib/admin/device-usage-purpose";
import { type DeviceListRow, deviceMatchesSearchQuery } from "@/lib/admin/device-list";

type SortCol = "status" | "assignedTo";
type SortDir = "asc" | "desc";
const STATUS_ORDER: Record<DeviceStatus, number> = { assigned: 0, in_stock: 1, suspended: 2, returned: 3, decommissioned: 4, lost: 5 };

function statusPillClass(status: DeviceStatus) {
  return ({ assigned: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200", in_stock: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200", suspended: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200", returned: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200", decommissioned: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200", lost: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200" })[status];
}

function operationalContext(row: DeviceListRow) {
  if (row.condition === "faulty" || row.status === "lost" || row.status === "suspended") return "Needs attention";
  if (row.assignedCustomer) return "Current installation";
  if (row.status === "returned") return "Inspect before reuse";
  if (row.status === "in_stock") return "Ready to assign";
  return "Not available";
}

export function DevicesTableClient({ rows }: { rows: DeviceListRow[] }) {
  const [query, setQuery] = useState("");
  const [purposeScope, setPurposeScope] = useState<DevicePurposeScope>("customer_only");
  const [quickFilter, setQuickFilter] = useState<"all" | "ready" | "assigned" | "no_sim" | "attention">("all");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const matching = rows.filter((r) => devicePurposeMatchesScope(r.usagePurpose, purposeScope)).filter((r) => deviceMatchesSearchQuery(r, deferredQuery)).filter((r) => quickFilter === "all" || (quickFilter === "ready" && r.status === "in_stock" && r.condition !== "faulty" && !r.assignedCustomer) || (quickFilter === "assigned" && Boolean(r.assignedCustomer)) || (quickFilter === "no_sim" && !r.sim) || (quickFilter === "attention" && (r.condition === "faulty" || r.status === "lost" || r.status === "suspended")));
    if (!sortCol) return matching;
    return [...matching].sort((a, b) => {
      const value = sortCol === "status" ? STATUS_ORDER[a.status] - STATUS_ORDER[b.status] : (a.assignedCustomer?.displayName ?? "").localeCompare(b.assignedCustomer?.displayName ?? "");
      return sortDir === "asc" ? value : -value;
    });
  }, [rows, purposeScope, deferredQuery, quickFilter, sortCol, sortDir]);
  const qTrim = query.trim();
  const toggleSort = (column: SortCol) => { if (column === sortCol) setSortDir((current) => current === "asc" ? "desc" : "asc"); else { setSortCol(column); setSortDir("asc"); } };
  const sortLabel = (column: SortCol) => `${column === "status" ? "Inventory status" : "Assigned customer"}${sortCol === column ? sortDir === "asc" ? " ↑" : " ↓" : ""}`;

  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap gap-2" aria-label="Device quick filters">
      {[["all", "All devices"], ["ready", "Ready to assign"], ["assigned", "Assigned"], ["no_sim", "No SIM"], ["attention", "Attention"]].map(([id, label]) => <button key={id} type="button" onClick={() => setQuickFilter(id as typeof quickFilter)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${quickFilter === id ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"}`}>{label}</button>)}
    </div>
    <div className="flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-end"><PurposeScopeFilter id="device-purpose-scope" entityLabel="devices" value={purposeScope} onChange={setPurposeScope} /><div className="min-w-0 flex-1"><label htmlFor="device-search" className="sr-only">Search devices</label><input id="device-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder="Search IMEI, device label, model, customer or SIM…" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div></div>
    {qTrim && filtered.length > 0 ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{filtered.length} shown for “{qTrim}” · <button type="button" onClick={() => setQuery("")} className="font-medium text-emerald-700 underline dark:text-emerald-400">Clear filter</button></p> : null}
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400"><tr><th className="min-w-[12rem] px-4 py-3">Device</th><th className="px-4 py-3">IMEI</th><th className="px-4 py-3"><button type="button" onClick={() => toggleSort("status")} className="hover:text-zinc-800 dark:hover:text-zinc-200">{sortLabel("status")}</button></th><th className="px-4 py-3">Condition</th><th className="px-4 py-3"><button type="button" onClick={() => toggleSort("assignedTo")} className="hover:text-zinc-800 dark:hover:text-zinc-200">{sortLabel("assignedTo")}</button></th><th className="min-w-[11rem] px-4 py-3">Linked SIM</th><th className="min-w-[10rem] px-4 py-3">Operational context</th><th className="px-4 py-3 text-center">Actions</th></tr></thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-zinc-500">No devices yet. Register a device to add trackers to the fleet.</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-zinc-500">No devices match your filters.</td></tr> : filtered.map((row) => <tr key={row.id} className="transition hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40"><td className="px-4 py-3 align-top"><p className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-50"><ObjectTypeIcon type={row.objectType} className="h-4 w-4 text-zinc-500" />{row.deviceModel.name}</p><p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{row.label?.trim() || "Unlabeled device"}</p></td><td className="px-4 py-3 align-top"><div className="flex items-center gap-1"><span className="whitespace-nowrap font-mono text-xs text-zinc-700 dark:text-zinc-300">{row.imei}</span><CopyValueButton value={row.imei} kind="IMEI" /></div></td><td className="px-4 py-3 align-top"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPillClass(row.status)}`}>{DEVICE_STATUS_LABEL[row.status]}</span></td><td className="px-4 py-3 align-top"><span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{row.condition}</span></td><td className="px-4 py-3 align-top">{row.assignedCustomer ? <Link href={`/admin/customers/${row.assignedCustomer.id}`} className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">{row.assignedCustomer.displayName}</Link> : <span className="text-zinc-500">—</span>}</td><td className="px-4 py-3 align-top">{row.sim ? <div className="font-mono text-xs"><Link href={`/admin/sims/${row.sim.id}`} className="text-emerald-800 hover:underline dark:text-emerald-300">{row.sim.iccid}</Link>{row.sim.msisdn?.trim() ? <p className="mt-1 text-zinc-500 dark:text-zinc-400">{row.sim.msisdn.trim()}</p> : null}</div> : <span className="text-zinc-500">—</span>}</td><td className="px-4 py-3 align-top text-sm text-zinc-700 dark:text-zinc-300">{operationalContext(row)}</td><td className="px-4 py-3 text-center align-top"><Link href={`/admin/devices/${row.id}/edit`} aria-label={`Manage ${row.label?.trim() || row.imei}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-lg font-bold tracking-widest text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">…</Link></td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
