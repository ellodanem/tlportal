export default function CanonicalSubscriptionsLoading() {
  return <div className="space-y-5" aria-busy="true" aria-label="Loading subscriptions"><div className="h-20 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />)}</div><div className="h-72 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" /></div>;
}
