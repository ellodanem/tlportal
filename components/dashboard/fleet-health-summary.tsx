import Link from "next/link";

import type { FleetHealthBucket, FleetHealthCounts } from "@/lib/admin/fleet-health";
import { fleetHealthPercent } from "@/lib/admin/fleet-health";

export type FleetHealthFilter = FleetHealthBucket | "all";

const BUCKETS: {
  key: FleetHealthFilter;
  label: string;
  shortLabel: string;
  accent: string;
  borderActive: string;
}[] = [
  {
    key: "all",
    label: "Total devices",
    shortLabel: "Total",
    accent: "border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/25",
    borderActive: "ring-2 ring-sky-400/80 border-sky-300 dark:ring-sky-600/60",
  },
  {
    key: "healthy",
    label: "Healthy",
    shortLabel: "Healthy",
    accent: "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/25",
    borderActive: "ring-2 ring-emerald-400/80 border-emerald-300 dark:ring-emerald-600/60",
  },
  {
    key: "renewal",
    label: "Due for renewal",
    shortLabel: "Renewal",
    accent: "border-l-rose-400 bg-rose-50/35 dark:bg-rose-950/20",
    borderActive: "ring-2 ring-rose-400/70 border-rose-300 dark:ring-rose-600/50",
  },
  {
    key: "review",
    label: "Needs review",
    shortLabel: "Review",
    accent: "border-l-violet-500 bg-violet-50/40 dark:bg-violet-950/25",
    borderActive: "ring-2 ring-violet-400/80 border-violet-300 dark:ring-violet-600/60",
  },
];

function countForKey(counts: FleetHealthCounts, key: FleetHealthFilter) {
  if (key === "all") return counts.total;
  return counts[key];
}

export function FleetHealthSummary({
  counts,
  activeFilter = "all",
  baseHref,
  title = "Fleet status",
  subtitle,
  generatedAt,
}: {
  counts: FleetHealthCounts;
  activeFilter?: FleetHealthFilter;
  /** When set, cards link to `baseHref?fleet=<bucket>` (customer page). Omit for display-only (admin). */
  baseHref?: string;
  title?: string;
  subtitle?: string;
  generatedAt?: Date;
}) {
  const total = counts.total;
  const metaLine = [
    generatedAt
      ? `Updated ${generatedAt.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}`
      : null,
    total > 0 ? `${total} open service${total === 1 ? "" : "s"}` : "No open services",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle ?? metaLine}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BUCKETS.map((b) => {
          const value = countForKey(counts, b.key);
          const pct = fleetHealthPercent(value, total);
          const isActive = activeFilter === b.key;
          const href =
            baseHref && b.key !== "all"
              ? `${baseHref}?fleet=${b.key}`
              : baseHref && b.key === "all"
                ? baseHref
                : undefined;

          const card = (
            <div
              className={`rounded-xl border border-zinc-200/90 border-l-4 p-4 ${b.accent} ${
                isActive ? b.borderActive : "hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {b.shortLabel}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {value.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {total > 0 ? `${pct}% of fleet` : "—"}
              </p>
              <p className="mt-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{b.label}</p>
            </div>
          );

          if (href) {
            return (
              <Link key={b.key} href={href} className="block rounded-xl transition hover:opacity-95">
                {card}
              </Link>
            );
          }
          return <div key={b.key}>{card}</div>;
        })}
      </div>
    </section>
  );
}
