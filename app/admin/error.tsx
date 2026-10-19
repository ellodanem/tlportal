"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm dark:border-rose-900/70 dark:bg-zinc-900">
      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Administration data is temporarily unavailable</p>
      <h1 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">We could not load this admin view.</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">No billing or inventory changes were made. Retry the read-only request, or return to the dashboard later.</p>
      <button type="button" onClick={reset} className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400">Retry</button>
    </section>
  );
}
