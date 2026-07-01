"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  cancelScheduledInvoiceEmailAction,
  type CancelScheduledEmailState,
} from "@/app/admin/tl-invoices/actions";
import { formatScheduledSendLabel } from "@/lib/billing/atlantic-date";

const initialCancel: CancelScheduledEmailState = {};

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
    >
      {pending ? "Cancelling…" : "Cancel scheduled send"}
    </button>
  );
}

export function InvoiceScheduledEmailBanner({
  invoiceId,
  sendAtIso,
  to,
}: {
  invoiceId: string;
  sendAtIso: string;
  to: string;
}) {
  const router = useRouter();
  const sendAt = new Date(sendAtIso);
  const [state, action] = useActionState(cancelScheduledInvoiceEmailAction, initialCancel);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-medium">Email scheduled</p>
      <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
        Invoice will be emailed to <strong>{to}</strong> on{" "}
        <strong>{formatScheduledSendLabel(sendAt)}</strong> (morning processing run, Atlantic time).
      </p>
      {state.error ? (
        <p className="mt-2 text-red-700 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="mt-2 text-emerald-800 dark:text-emerald-300" role="status">
          {state.message}
        </p>
      ) : null}
      <form action={action} className="mt-3">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <CancelButton />
      </form>
    </div>
  );
}
