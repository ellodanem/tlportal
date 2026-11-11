import Link from "next/link";

import { CnIcon } from "@/components/admin/customer-new/icons";
import { customerNewHref, type CustomerNewFilter } from "@/lib/admin/customer-new";

export type CustomerListRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  initials: string;
  hasSubscription: boolean;
  subscriptionCount: number;
  /** Formatted open balance, e.g. "EC$0.00". */
  outstanding: string;
  hasOutstanding: boolean;
};

const FILTERS: { id: CustomerNewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "subscribed", label: "With subscription" },
  { id: "none", label: "No subscription" },
];

/** Shared column template so the header and every row line up from `md` up. */
const GRID =
  "md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_minmax(0,1.3fr)_4.5rem_6.5rem_7.5rem_4.5rem] md:items-center md:gap-4";

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
    <section className={`flex min-w-0 flex-col gap-4 ${className}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Customers</h1>
          <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{total}</span>
        </div>
        <Link
          href="/admin/customer-new/create"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 sm:min-h-10 lg:w-auto dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <CnIcon name="plus" className="size-4" />
          New customer
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form method="get" action="/admin/customer-new" className="relative w-full sm:max-w-sm">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <CnIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
          />
          {/* text-base on phones keeps iOS from zooming the page when the field is focused */}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search customers..."
            aria-label="Search customers"
            enterKeyHint="search"
            className="min-h-11 w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-base text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 sm:min-h-10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
                className={`inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-medium sm:min-h-0 sm:px-2.5 ${
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

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No customers match.</p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className={`hidden border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400 ${GRID}`}
            >
              <span>Customer</span>
              <span>Email</span>
              <span>Phone</span>
              <span className="text-right">Subs</span>
              <span className="text-right">Outstanding</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <Link
                      href={customerNewHref({ c: row.id, q, filter })}
                      scroll={false}
                      aria-current={selected ? "true" : undefined}
                      className={`group flex min-h-16 items-center gap-3 border-l-4 px-3 py-3 sm:px-4 md:px-5 md:py-3.5 ${GRID} ${
                        selected
                          ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
                          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                          {row.initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {row.name}
                          </span>
                          {/* Phones have no Email column, so show it under the name. */}
                          <span className="block truncate text-xs text-zinc-500 md:hidden dark:text-zinc-400">
                            {row.email ?? "No email"}
                          </span>
                        </span>
                      </span>
                      <span className="hidden min-w-0 truncate text-sm text-zinc-700 md:block dark:text-zinc-300">
                        {row.email ?? <span className="text-zinc-400 dark:text-zinc-500">No email</span>}
                      </span>
                      <span className="hidden min-w-0 truncate text-sm text-zinc-700 md:block dark:text-zinc-300">
                        {row.phone ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                      </span>
                      <span className="hidden text-right text-sm tabular-nums text-zinc-700 md:block dark:text-zinc-300">
                        {row.subscriptionCount}
                      </span>
                      <span
                        className={`hidden text-right text-sm font-medium tabular-nums md:block ${
                          row.hasOutstanding
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {row.outstanding}
                      </span>
                      <span
                        className={`shrink-0 justify-self-start whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          row.hasSubscription
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {row.hasSubscription ? "Active" : "No subscription"}
                      </span>
                      <span className="hidden justify-self-end text-sm font-medium text-emerald-700 group-hover:underline md:inline dark:text-emerald-400">
                        View →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
