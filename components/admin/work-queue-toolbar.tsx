import Link from "next/link";

export type WorkQueueView = { id: string; label: string; count?: number };

export function WorkQueueToolbar({
  basePath,
  query,
  placeholder,
  views,
  activeView,
  hiddenFields = {},
}: {
  basePath: string;
  query: string;
  placeholder: string;
  views: WorkQueueView[];
  activeView?: string;
  hiddenFields?: Record<string, string>;
}) {
  function href(view?: string, includeQuery = true) {
    const params = new URLSearchParams();
    if (includeQuery && query) params.set("q", query);
    for (const [key, value] of Object.entries(hiddenFields)) {
      if (value) params.set(key, value);
    }
    if (view) params.set("view", view);
    return params.toString() ? `${basePath}?${params.toString()}` : basePath;
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <form method="get" action={basePath} className="flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search</span>
          <input
            name="q"
            defaultValue={query}
            placeholder={placeholder}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>
        {Object.entries(hiddenFields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
          Search
        </button>
        {query ? <Link href={href(undefined, false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Clear</Link> : null}
      </form>
      <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Work queue views">
        {views.map((view) => (
          <Link
            key={view.id}
            href={href(view.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              activeView === view.id
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "bg-zinc-100 text-zinc-700 hover:bg-emerald-100 hover:text-emerald-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-200"
            }`}
          >
            {view.label}{view.count != null ? ` (${view.count})` : ""}
          </Link>
        ))}
      </nav>
    </section>
  );
}
