"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createServiceAdjustmentInvoiceAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};

/**
 * Creates a DRAFT invoice for an agreed partial-period charge, then opens it in the
 * invoice editor so staff can add lines (for example a hardware fee) before finalizing.
 * Nothing is numbered, emailed, collected, or charged by this form.
 */
export function SubscriptionAdjustmentInvoiceForm({
  subscriptionId,
  subscriptionItemId,
  generationKey,
  confirmationToken,
  amountLabel,
}: {
  subscriptionId: string;
  subscriptionItemId: string;
  generationKey: string;
  confirmationToken: string;
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState(createServiceAdjustmentInvoiceAction, initialState);
  const router = useRouter();
  useEffect(() => {
    if (state.next) router.push(state.next);
    else if (state.message) router.refresh();
  }, [router, state.message, state.next]);

  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="subscriptionItemId" value={subscriptionItemId} />
      <input type="hidden" name="generationKey" value={generationKey} />
      <input type="hidden" name="confirmationToken" value={confirmationToken} />
      <p className="text-zinc-700 dark:text-zinc-300">This creates a <strong>draft</strong> with the {amountLabel} line. You can then add other lines, such as a hardware fee, adjust dates and notes, and finalize it yourself.</p>
      <label className="flex items-start gap-2">
        <input required type="checkbox" name="confirmInvoice" value="yes" className="mt-1" />
        <span>Create a draft invoice for {amountLabel}. It will not be numbered, emailed, charged, or sent until I finalize it.</span>
      </label>
      <button type="submit" disabled={pending || Boolean(state.next)} className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? "Creating draft…" : "Create draft invoice"}
      </button>
      {state.error ? <p role="alert" className="text-red-700 dark:text-red-300">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
    </form>
  );
}
