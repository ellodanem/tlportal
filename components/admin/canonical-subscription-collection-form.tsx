"use client";

import { useActionState } from "react";

import { type CanonicalSubscriptionFormState, updateCanonicalDraftCollectionMethodAction } from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};

export function CanonicalSubscriptionCollectionForm({ subscriptionId, value }: { subscriptionId: string; value: "manual_invoice" | "stripe_autocharge" }) {
  const [state, action, pending] = useActionState(updateCanonicalDraftCollectionMethodAction, initialState);
  return <form action={action} className="mt-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end dark:border-zinc-700 dark:bg-zinc-900"><input type="hidden" name="subscriptionId" value={subscriptionId} /><label className="flex-1 text-sm font-medium">Collection method confirmed at installation<select name="collectionMethod" defaultValue={value} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="manual_invoice">Manual / cheque invoice</option><option value="stripe_autocharge">Stripe autocharge (test-mode workflow only)</option></select></label><button disabled={pending} className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300">{pending ? "Saving…" : "Save collection method"}</button>{state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}{state.message ? <p role="status" className="text-sm text-emerald-700">{state.message}</p> : null}</form>;
}
