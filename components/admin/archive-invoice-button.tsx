"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  archiveInvoiceAction,
  unarchiveInvoiceAction,
  type ArchiveInvoiceState,
} from "@/app/admin/tl-invoices/actions";

const initial: ArchiveInvoiceState = {};

export function ArchiveInvoiceButton({
  invoiceId,
  displayNumber,
  isStripeMirror,
}: {
  invoiceId: string;
  displayNumber: string;
  isStripeMirror?: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(archiveInvoiceAction, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const stripeNote = isStripeMirror
    ? " This hides the row in TL Portal only — it does not void or write off the invoice in Stripe."
    : "";

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Archive ${displayNumber}? It will be hidden from the invoice list, AR aging, and billing reminders.${stripeNote}`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
      >
        Archive invoice
      </button>
      {state.error ? <p className="mt-1 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}

export function UnarchiveInvoiceButton({
  invoiceId,
  displayNumber,
}: {
  invoiceId: string;
  displayNumber: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(unarchiveInvoiceAction, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Restore ${displayNumber} to the active invoice list?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
      >
        Restore from archive
      </button>
      {state.error ? <p className="mt-1 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}
