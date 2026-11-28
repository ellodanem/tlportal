"use client";

import { useActionState } from "react";

import {
  cancelOpenStripeCheckoutAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import type { CanonicalCheckoutKind } from "@/lib/domain/canonical-stripe-card-on-file";

const initialState: CanonicalSubscriptionFormState = {};

export function CancelOpenCheckoutForm({
  subscriptionId,
  kind,
}: {
  subscriptionId: string;
  kind: CanonicalCheckoutKind;
}) {
  const [state, action, pending] = useActionState(cancelOpenStripeCheckoutAction, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="checkoutKind" value={kind} />
      {state.error ? <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      {state.message ? <p role="status" className="mb-3 text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
      <button
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "Canceling…" : "Cancel this link"}
      </button>
    </form>
  );
}
