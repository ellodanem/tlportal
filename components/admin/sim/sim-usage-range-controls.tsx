"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  SIM_USAGE_RANGE_MAX_SPAN_DAYS,
  buildSimUsageRangeHref,
  formatYmdUtc,
  presetInclusiveDaysEndingToday,
  utcCalendarToday,
} from "@/lib/nce/sim-usage-range";

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
  { label: "Max", days: SIM_USAGE_RANGE_MAX_SPAN_DAYS },
];

type Props = {
  simId: string;
  usageFrom: string;
  usageTo: string;
  /** True when the page URL has no usage range query (server default window). */
  isDefaultRange: boolean;
};

export function SimUsageRangeControls({
  simId,
  usageFrom,
  usageTo,
  isDefaultRange,
}: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(usageFrom);
  const [to, setTo] = useState(usageTo);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setFrom(usageFrom);
    setTo(usageTo);
    setFormError(null);
  }, [usageFrom, usageTo]);

  function applyCustom() {
    setFormError(null);
    let a = from.trim();
    let b = to.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
      setFormError("Use YYYY-MM-DD for both dates.");
      return;
    }
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    const todayYmd = formatYmdUtc(utcCalendarToday());
    if (b > todayYmd) b = todayYmd;
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    const startMs = Date.parse(`${a}T12:00:00.000Z`);
    const endMs = Date.parse(`${b}T12:00:00.000Z`);
    const span = Math.floor((endMs - startMs) / 86_400_000) + 1;
    if (span > SIM_USAGE_RANGE_MAX_SPAN_DAYS) {
      setFormError(`Range cannot exceed ${SIM_USAGE_RANGE_MAX_SPAN_DAYS} days. Choose a shorter span.`);
      return;
    }
    router.push(buildSimUsageRangeHref(simId, a, b));
  }

  const base = `/admin/sims/${encodeURIComponent(simId)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Presets</span>
        {PRESETS.map(({ label, days }) => {
          const { usageFrom: pf, usageTo: pt } = presetInclusiveDaysEndingToday(days);
          const href = buildSimUsageRangeHref(simId, pf, pt);
          const active = pf === usageFrom && pt === usageTo;
          return (
            <Link
              key={label}
              href={href}
              prefetch={false}
              className={
                active
                  ? "rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white dark:bg-emerald-500"
                  : "rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }
            >
              {label}
            </Link>
          );
        })}
        <Link
          href={base}
          prefetch={false}
          className={
            isDefaultRange
              ? "rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white dark:bg-emerald-500"
              : "rounded-md border border-dashed border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }
        >
          Default (~180d)
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="usage-from" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            From
          </label>
          <input
            id="usage-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="usage-to" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            To
          </label>
          <input
            id="usage-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <button
          type="button"
          onClick={() => applyCustom()}
          className="rounded-md bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-900 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
        >
          Apply range
        </button>
      </div>
      {formError ? (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}
