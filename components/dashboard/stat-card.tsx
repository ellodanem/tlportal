import Link from "next/link";
import type { ReactNode } from "react";

export type StatBadge = {
  label: string;
  variant: "neutral" | "amber" | "rose" | "emerald" | "slate" | "sky" | "violet";
};

export type StatCardAccent = "zinc" | "emerald" | "sky" | "violet" | "cyan" | "amber" | "rose";

const badgeClass: Record<StatBadge["variant"], string> = {
  neutral:
    "border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
  amber:
    "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  rose: "border border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  emerald:
    "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  slate:
    "border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  sky: "border border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-200",
  violet:
    "border border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
};

const accentStyles: Record<
  StatCardAccent,
  { iconWrap: string; card: string; label: string }
> = {
  zinc: {
    iconWrap: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    card: "border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600",
    label: "text-zinc-500 dark:text-zinc-400",
  },
  emerald: {
    iconWrap: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-300",
    card: "border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/30 to-emerald-50/60 hover:border-emerald-300 dark:border-emerald-900/45 dark:from-zinc-900 dark:via-emerald-950/15 dark:to-emerald-950/30 dark:hover:border-emerald-700/80",
    label: "text-emerald-800/80 dark:text-emerald-300/90",
  },
  sky: {
    iconWrap: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    card: "border-sky-200/70 bg-gradient-to-br from-white via-sky-50/25 to-sky-50/55 hover:border-sky-300 dark:border-sky-900/40 dark:from-zinc-900 dark:via-sky-950/15 dark:to-sky-950/30 dark:hover:border-sky-700/80",
    label: "text-sky-800/80 dark:text-sky-300/90",
  },
  violet: {
    iconWrap: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    card: "border-violet-200/70 bg-gradient-to-br from-white via-violet-50/20 to-violet-50/50 hover:border-violet-300 dark:border-violet-900/40 dark:from-zinc-900 dark:via-violet-950/15 dark:to-violet-950/28 dark:hover:border-violet-700/80",
    label: "text-violet-800/80 dark:text-violet-300/90",
  },
  cyan: {
    iconWrap: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
    card: "border-cyan-200/70 bg-gradient-to-br from-white via-cyan-50/20 to-cyan-50/50 hover:border-cyan-300 dark:border-cyan-900/40 dark:from-zinc-900 dark:via-cyan-950/12 dark:to-cyan-950/28 dark:hover:border-cyan-700/80",
    label: "text-cyan-800/80 dark:text-cyan-300/90",
  },
  amber: {
    iconWrap: "bg-amber-100 text-amber-800 dark:bg-amber-950/45 dark:text-amber-300",
    card: "border-amber-200/70 bg-gradient-to-br from-white via-amber-50/25 to-amber-50/45 hover:border-amber-300 dark:border-amber-900/40 dark:from-zinc-900 dark:via-amber-950/12 dark:to-amber-950/25 dark:hover:border-amber-700/80",
    label: "text-amber-900/75 dark:text-amber-300/90",
  },
  rose: {
    iconWrap: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    card: "border-rose-200/70 bg-gradient-to-br from-white via-rose-50/25 to-rose-50/45 hover:border-rose-300 dark:border-rose-900/40 dark:from-zinc-900 dark:via-rose-950/12 dark:to-rose-950/25 dark:hover:border-rose-700/80",
    label: "text-rose-800/80 dark:text-rose-300/90",
  },
};

export function StatCard({
  label,
  value,
  href,
  icon,
  badges,
  hint,
  accent = "zinc",
}: {
  label: string;
  value: number | string;
  href?: string;
  icon: ReactNode;
  badges?: StatBadge[];
  hint?: string;
  accent?: StatCardAccent;
}) {
  const a = accentStyles[accent];

  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-xs font-medium uppercase tracking-wide ${a.label}`}>{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {badges && badges.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass[b.variant]}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
        {hint ? <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
      </div>
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${a.iconWrap}`}
      >
        {icon}
      </div>
    </div>
  );

  const className = `block rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${a.card}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
