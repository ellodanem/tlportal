import { formatMegabytes } from "@/lib/format/mbytes";

export function DataUsageDonut({
  usedMb,
  totalMb,
}: {
  usedMb: number | null | undefined;
  totalMb: number | null | undefined;
}) {
  const used = usedMb ?? 0;
  const total = totalMb ?? null;
  const hasQuota = total != null && total > 0;
  const pctUsed = hasQuota ? Math.min(100, Math.max(0, (used / total!) * 100)) : null;
  const pctRemaining = pctUsed != null ? Math.max(0, 100 - pctUsed) : null;

  const degUsed = pctUsed != null ? (pctUsed / 100) * 360 : 0;
  const centerLabel =
    pctUsed != null
      ? `${pctUsed.toFixed(0)}% used`
      : used > 0
        ? `${formatMegabytes(used, 1)} used`
        : "No usage data";

  const sub =
    hasQuota && pctRemaining != null
      ? `${formatMegabytes(Math.max(0, total! - used), 1)} remaining`
      : hasQuota
        ? `${formatMegabytes(total!, 1)} allowance`
        : "Set allowance after sync";

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative h-44 w-44 shrink-0">
        <div
          className="h-full w-full rounded-full shadow-inner ring-1 ring-zinc-200/80 dark:ring-zinc-700"
          style={
            pctUsed != null
              ? {
                  background: `conic-gradient(rgb(16 185 129) 0deg ${degUsed}deg, rgb(244 244 245) ${degUsed}deg 360deg)`,
                }
              : {
                  background: "conic-gradient(rgb(161 161 170) 0deg 360deg)",
                }
          }
        />
        <div className="absolute inset-0 flex items-center justify-center p-10">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-sm dark:bg-zinc-900">
            <div className="px-2 text-center">
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{centerLabel}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
            </div>
          </div>
        </div>
      </div>
      <ul className="w-full max-w-xs space-y-3 text-sm">
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Used data
          </span>
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">{formatMegabytes(used, 2)}</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            Remaining
          </span>
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
            {hasQuota ? formatMegabytes(Math.max(0, total! - used), 2) : "—"}
          </span>
        </li>
        {pctUsed != null && pctUsed >= 90 ? (
          <li className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Approaching or at data allowance — consider top-up or plan change.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
