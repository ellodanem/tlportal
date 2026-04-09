"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useDeferredValue, useMemo, useState } from "react";

import { PurposeScopeFilter } from "@/components/admin/device/purpose-scope-filter";
import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { formatMegabytes } from "@/lib/format/mbytes";
import {
  type DevicePurposeScope,
  simPurposeMatchesScope,
} from "@/lib/admin/device-usage-purpose";
import { type SimListRow, simMatchesSearchQuery } from "@/lib/admin/sim-list-filter";

function deviceLabel(device: SimListRow["device"]) {
  if (!device) return "—";
  const primary = device.label?.trim() || device.imei;
  return `${primary} · ${device.deviceModel.name}`;
}

function simsListHref(opts: { usage?: "asc"; avgDays?: 7 | 30 | 90 }) {
  const params = new URLSearchParams();
  if (opts.usage === "asc") params.set("usage", "asc");
  if (opts.avgDays !== undefined && opts.avgDays !== 30) params.set("avg", String(opts.avgDays));
  const s = params.toString();
  return s ? `/admin/sims?${s}` : "/admin/sims";
}

type Props = {
  /** Title + description (server-rendered) */
  intro: ReactNode;
  rows: SimListRow[];
  usageLowFirst: boolean;
  /** Divisor for est. MB/day (used ÷ days); from URL `avg` (default 30). */
  avgWindowDays: 7 | 30 | 90;
  /** Import + external links, rendered beside the filter field */
  headerActions?: ReactNode;
};

function formatEstMbPerDay(usedMb: number | null | undefined, days: number): string {
  if (usedMb == null || Number.isNaN(usedMb) || days <= 0) return "—";
  const rate = usedMb / days;
  return `${rate.toFixed(1)} MB/day`;
}

export function SimsTableClient({ intro, rows, usageLowFirst, avgWindowDays, headerActions }: Props) {
  const [query, setQuery] = useState("");
  const [purposeScope, setPurposeScope] = useState<DevicePurposeScope>("customer_only");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => simPurposeMatchesScope(r.deviceUsagePurpose, purposeScope))
      .filter((r) => simMatchesSearchQuery(r, deferredQuery));
  }, [rows, deferredQuery, purposeScope]);

  const qTrim = query.trim();
  const showResultHint = qTrim.length > 0 && rows.length > 0 && filtered.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">{intro}</div>
        <div className="flex w-full min-w-0 flex-col gap-3 sm:max-w-[min(100%,42rem)] sm:flex-1">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <PurposeScopeFilter
              id="sim-purpose-scope"
              entityLabel="SIMs"
              value={purposeScope}
              onChange={setPurposeScope}
            />
            <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:max-w-md">
              <label htmlFor="sim-search" className="sr-only">
                Filter by ICCID, label, or device
              </label>
              <input
                id="sim-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                placeholder="Filter ICCID, label, device, tags…"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>
            {headerActions ? (
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{headerActions}</div>
            ) : null}
          </div>
        </div>
      </div>

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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">ICCID / label</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3">Device</th>
              <th
                className="px-4 py-3 text-right"
                title="Estimate: current usage ÷ selected days. Not calendar history from the carrier."
              >
                <div className="flex flex-col items-end gap-1.5">
                  <span>Est. MB/day</span>
                  <div className="flex flex-wrap justify-end gap-1 normal-case">
                    {([7, 30, 90] as const).map((d) => (
                      <Link
                        key={d}
                        href={simsListHref({
                          usage: usageLowFirst ? "asc" : undefined,
                          avgDays: d,
                        })}
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-normal transition ${
                          avgWindowDays === d
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                            : "text-zinc-600 underline decoration-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
                        }`}
                      >
                        {d}d
                      </Link>
                    ))}
                  </div>
                </div>
              </th>
              <th className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                  <span>Used / total</span>
                  <Link
                    href={simsListHref({
                      usage: usageLowFirst ? undefined : "asc",
                      avgDays: avgWindowDays,
                    })}
                    className="whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold normal-case tracking-normal text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    title={
                      usageLowFirst
                        ? "Switch to highest used data first"
                        : "Switch to lowest used data first"
                    }
                  >
                    {usageLowFirst ? "Show highest used" : "Show lowest used"}
                  </Link>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No SIM cards yet.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No SIM cards match your filter.{" "}
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
              filtered.map((sim) => (
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
                  <td className="px-4 py-3 align-top">
                    {sim.deviceUsagePurpose == null ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Unlinked</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <UsagePurposeBadge purpose={sim.deviceUsagePurpose} />
                          {sim.deviceUsagePurpose === "customer" ? (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">Production</span>
                          ) : null}
                        </div>
                        {sim.deviceTags.length > 0 ? (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{sim.deviceTags.join(" · ")}</p>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-700 dark:text-zinc-300">{deviceLabel(sim.device)}</td>
                  <td className="px-4 py-3 align-top text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                    {formatEstMbPerDay(sim.usedDataMB, avgWindowDays)}
                  </td>
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
