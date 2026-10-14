"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { addCustomerNoteAction, type CustomerNoteActionState } from "@/app/admin/customers/note-actions";

const initialState: CustomerNoteActionState = { error: null };

export function CustomerNoteForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addCustomerNoteAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <input type="hidden" name="customerId" value={customerId} />
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add internal note</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Visible to staff only; notes become part of the customer activity timeline.</p>
      </div>
      {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      {state.ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">Note added.</p> : null}
      <textarea
        name="note"
        rows={4}
        maxLength={4000}
        required
        placeholder="Record a handoff, customer preference, or follow-up…"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      />
      <button disabled={pending} type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500">
        {pending ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}
