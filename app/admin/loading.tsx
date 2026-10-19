function LoadingCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`} />;
}

/** Route-level fallback for live admin reporting and navigation. */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading administration data">
      <LoadingCard className="h-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LoadingCard className="h-40" />
        <LoadingCard className="h-40" />
        <LoadingCard className="h-40" />
        <LoadingCard className="h-40" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3"><LoadingCard className="h-80 xl:col-span-2" /><LoadingCard className="h-80" /></div>
      <LoadingCard className="h-64" />
    </div>
  );
}
