"use client";

import { useActionState } from "react";

import { activateCanonicalManualSubscriptionAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};

export function CanonicalManualActivationForm({ subscriptionId }: { subscriptionId: string }) {
  const [state, action, pending] = useActionState(activateCanonicalManualSubscriptionAction, initialState);
  return <form action={action} className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-zinc-900">
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <p className="text-sm text-zinc-600 dark:text-zinc-300">This local/test action creates one future recurring schedule at the configured next billing date. It creates no invoice, payment, Stripe object, email, or WhatsApp notification.</p>
    <label className="flex items-start gap-2 text-sm"><input required type="checkbox" name="confirmed" value="yes" className="mt-1" /><span>I reviewed the services, exact cycle prices, interval, next billing date, and seven-day grace period.</span></label>
    {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
    {state.message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p> : null}
    <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Activating…" : "Activate manual subscription (test/local)"}</button>
  </form>;
}
