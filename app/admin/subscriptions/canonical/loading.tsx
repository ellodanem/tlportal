export default function CanonicalSubscriptionsLoading() {
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-5" aria-busy="true" aria-label="Loading subscriptions">
    <div className="h-16 w-72 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
    <div className="h-20 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="h-16 border-b border-zinc-100 p-3 dark:border-zinc-800"><div className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" /></div>
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4 last:border-b-0 dark:border-zinc-800"><div className="size-9 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" /><div className="h-4 w-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" /></div>)}
    </div>
  </div>;
}
