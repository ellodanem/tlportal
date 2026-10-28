import Link from "next/link";

import { CnIcon } from "@/components/admin/customer-new/icons";
import { customerNewHref, type CustomerNewFilter } from "@/lib/admin/customer-new";

export type CustomerListRow = {
  id: string;
  name: string;
  email: string | null;
  initials: string;
  hasSubscription: boolean;
};

const FILTERS: { id: CustomerNewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "subscribed", label: "With subscription" },
  { id: "none", label: "No subscription" },
];

export function CustomerListPane({
  rows,
  total,
  selectedId,
  q,
  filter,
  className = "",
}: {
  rows: CustomerListRow[];
  total: number;
  selectedId: string | null;
  q: string;
  filter: CustomerNewFilter;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Customers</h1>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{total}</span>
        </div>
        <Link
          href="/admin/customer-new/create"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <CnIcon name="plus" className="size-4" />
          New customer
        </Link>
        <form method="get" action="/admin/customer-new" className="relative">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <CnIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search customers..."
            aria-label="Search customers"
            className="min-h-10 w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <Link
                key={f.id}
                href={customerNewHref({ q, filter: f.id })}
                aria-current={active ? "true" : undefined}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  active
                    ? "bg-emerald-700 text-white dark:bg-emerald-600"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No customers match.</p>
      ) : (
        <ul className="max-h-[calc(100vh-22rem)] min-h-48 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
          {rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <li key={row.id}>
                <Link
                  href={customerNewHref({ c: row.id, q, filter })}
                  aria-current={selected ? "true" : undefined}
                  className={`flex items-center gap-3 border-l-4 px-4 py-3 ${
                    selected
                      ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
                      : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                    {row.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{row.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {row.email ?? "No email"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      row.hasSubscription
                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {row.hasSubscription ? "Active" : "No subscription"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
