"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { invoiceDeleteInitialState } from "@/app/admin/invoices/action-state";
import { deleteInvoiceFromPortal } from "@/app/admin/invoices/actions";

function DeleteButton({ displayNum }: { displayNum: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
      onClick={(e) => {
        if (
          !confirm(
            `Delete invoice #${displayNum} in Invoiless permanently? This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}

export function InvoiceDeleteForm({ invoiceId, displayNum }: { invoiceId: string; displayNum: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(deleteInvoiceFromPortal, invoiceDeleteInitialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <DeleteButton displayNum={displayNum} />
      {state.error ? (
        <span className="ml-2 text-xs text-red-600 dark:text-red-400" title={state.error}>
          Error
        </span>
      ) : null}
    </form>
  );
}
