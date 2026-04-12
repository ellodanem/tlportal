"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { syncSimFromOneNce } from "@/app/admin/sims/actions";

export function SimSyncButton({ simId }: { simId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    setError(null);
    setPending(true);
    try {
      const result = await syncSimFromOneNce(simId);
      if (result.ok) {
        await router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={onSync}
        disabled={pending}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
      >
        {pending ? "Syncing…" : "Sync from 1NCE"}
      </button>
      {error ? <p className="max-w-sm text-right text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
