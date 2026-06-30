"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { convertQuoteToInvoiceAction, type ConvertQuoteState } from "@/app/admin/quotes/actions";

const initialState: ConvertQuoteState = {};

function ConvertButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
    >
      {pending ? "Converting…" : "Convert to invoice"}
    </button>
  );
}

export function QuoteConvertForm({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [state, action] = useActionState(convertQuoteToInvoiceAction, initialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Convert to native invoice</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Creates a draft TL invoice with the same line items — finalize and send from TL invoices.
      </p>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="quoteId" value={quoteId} />
        <div>
          <label htmlFor="dueDate" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Due date <span className="font-normal">(optional)</span>
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <ConvertButton />
      </form>

      {state.error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-300" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
