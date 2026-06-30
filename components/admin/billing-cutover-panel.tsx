"use client";

import { useActionState } from "react";

import {
  runInvoilessBackfillBatchAction,
  type BackfillActionState,
} from "@/app/admin/billing-cutover/actions";

const initial: BackfillActionState = {};

export function InvoilessBackfillForm({ startPage }: { startPage: number }) {
  const [state, action, pending] = useActionState(runInvoilessBackfillBatchAction, initial);
  const nextPage = state.result?.nextPage ?? startPage;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="page" value={nextPage} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-fit justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
      >
        {pending ? "Importing…" : state.result?.hasMore ? "Import next batch" : "Run import batch"}
      </button>
      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state.result ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          <p>
            Page {state.result.page}: imported <strong>{state.result.imported}</strong>, skipped{" "}
            {state.result.skipped}, processed {state.result.processed}.
            {state.result.hasMore ? ` More pages remain — run again.` : " No more pages in this batch window."}
          </p>
          {state.result.errors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">
              {state.result.errors.slice(0, 5).map((err) => (
                <li key={err}>{err}</li>
              ))}
              {state.result.errors.length > 5 ? (
                <li>…and {state.result.errors.length - 5} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
