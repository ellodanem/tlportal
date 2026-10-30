"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  createServiceAdjustmentInvoiceAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};

/**
 * Explicit, reviewed creation of the open invoice for an agreed partial-period charge.
 * The invoice is created unsent; nothing is emailed, collected, or charged.
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
    if (state.message) router.refresh();
  }, [router, state.message]);

  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="subscriptionItemId" value={subscriptionItemId} />
      <input type="hidden" name="generationKey" value={generationKey} />
      <input type="hidden" name="confirmationToken" value={confirmationToken} />
      <label className="flex items-start gap-2">
        <input required type="checkbox" name="confirmInvoice" value="yes" className="mt-1" />
        <span>I authorize creating one open invoice for {amountLabel}. It will not be emailed, charged, or sent to the customer.</span>
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? "Creating invoice…" : `Create invoice for ${amountLabel}`}
      </button>
      {state.error ? <p role="alert" className="text-red-700 dark:text-red-300">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
    </form>
  );
}
