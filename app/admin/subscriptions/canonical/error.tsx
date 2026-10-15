"use client";

export default function CanonicalSubscriptionsError({ reset }: { error: Error; reset: () => void }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"><h1 className="text-lg font-semibold">Canonical subscriptions could not be loaded</h1><p className="mt-2 text-sm">No billing action was performed. Retry the read-only request or return to legacy subscriptions.</p><button type="button" onClick={reset} className="mt-4 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white">Try again</button></div>;
}
