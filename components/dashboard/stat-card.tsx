import Link from "next/link";
import type { ReactNode } from "react";

export type StatBadge = {
  label: string;
  variant: "neutral" | "amber" | "rose" | "emerald" | "slate";
};

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
};

export function StatCard({
  label,
  value,
  href,
  icon,
  badges,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  icon: ReactNode;
  badges?: StatBadge[];
  hint?: string;
}) {
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {icon}
      </div>
    </div>
  );

  const className =
    "block rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:border-emerald-300/80 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800";

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
