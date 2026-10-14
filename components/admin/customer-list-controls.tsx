import Link from "next/link";

type Props = {
  query: string;
  view: string;
  showArchived: boolean;
};

const controlClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function CustomerListControls({ query, view, showArchived }: Props) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="customer-search" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Search customers
          </label>
          <input
            id="customer-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Name, company, email, or phone"
            className={`${controlClass} mt-1 w-full`}
          />
        </div>
        <div className="w-full lg:w-56">
          <label htmlFor="customer-view" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            View
          </label>
          <select id="customer-view" name="view" defaultValue={view} className={`${controlClass} mt-1 w-full`}>
            <option value="all">All active</option>
            <option value="attention">Needs attention</option>
            <option value="stripe">Stripe customers</option>
            <option value="manual">Manual customers</option>
            <option value="no-services">No active services</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Apply filters
        </button>
        {query || view !== (showArchived ? "archived" : "all") ? (
          <Link
            href={showArchived ? "/admin/customers?view=archived" : "/admin/customers"}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Clear
          </Link>
        ) : null}
      </form>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Needs attention includes overdue or soon-due services, paused services, and Stripe payment issues.
      </p>
    </section>
  );
}
