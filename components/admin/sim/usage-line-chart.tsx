"use client";

import { useMemo } from "react";

import type { UsageSeriesPoint } from "@/lib/nce/sim-api";

function formatShortDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function UsageLineChart({ points }: { points: UsageSeriesPoint[] }) {
  const { pathD, areaD, maxY, labels } = useMemo(() => {
    if (points.length === 0) {
      return { pathD: "", areaD: "", maxY: 1, labels: [] as { x: number; text: string }[] };
    }
    const w = 560;
    const h = 200;
    const pad = { top: 16, right: 12, bottom: 28, left: 12 };
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;
    const maxVal = Math.max(...points.map((p) => p.usedMb), 1);
    const n = points.length;
    const step = n > 1 ? innerW / (n - 1) : 0;

    const pts = points.map((p, i) => {
      const x = pad.left + (n === 1 ? innerW / 2 : i * step);
      const y = pad.top + innerH - (p.usedMb / maxVal) * innerH;
      return { x, y, date: p.date };
    });

    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L ${pts[pts.length - 1]!.x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${pts[0]!.x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;

    const labelPick = [0, Math.floor((n - 1) / 2), n - 1].filter((i, j, a) => a.indexOf(i) === j);
    const ls = labelPick.map((i) => ({
      x: pts[i]!.x,
      text: formatShortDate(pts[i]!.date),
    }));

    return { pathD: line, areaD: area, maxY: maxVal, labels: ls };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400">
        No usage history for this range. Sync the SIM and ensure 1NCE returns usage for the period.
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 560 220" className="h-auto w-full text-emerald-600" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#usageFill)" />
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {labels.map((l) => (
          <text
            key={l.text + l.x}
            x={l.x}
            y="208"
            textAnchor="middle"
            className="fill-zinc-400 text-[10px] dark:fill-zinc-500"
          >
            {l.text}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Daily data usage (MB, max {maxY.toFixed(1)} MB in range)
      </p>
    </div>
  );
}
