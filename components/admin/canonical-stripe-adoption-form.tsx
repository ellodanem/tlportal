"use client";

import { useActionState } from "react";

import { adoptExistingStripeSubscriptionAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};

export function CanonicalStripeAdoptionForm({ subscriptionId, serviceCount, cycleTotal, nextBillingDate }: {
  subscriptionId: string;
  serviceCount: number;
  cycleTotal: string | null;
  nextBillingDate: string;
}) {
  const [state, action, pending] = useActionState(adoptExistingStripeSubscriptionAction, initialState);
  return <form action={action} className="mt-4 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-zinc-900">
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <h3 className="font-semibold">Connect existing Stripe billing</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">TL Portal will read the existing Stripe subscription, require an exact match to these service terms, then record its Price and subscription-item mapping. It will not create, cancel, pause, replace, or charge anything in Stripe.</p>
    <dl className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-3 dark:bg-zinc-950"><div><dt className="text-zinc-500">Services</dt><dd className="mt-1 font-semibold">{serviceCount}</dd></div><div><dt className="text-zinc-500">Recurring total</dt><dd className="mt-1 font-semibold tabular-nums">{cycleTotal ? `EC$${cycleTotal}` : "Unavailable"}</dd></div><div><dt className="text-zinc-500">Next renewal</dt><dd className="mt-1 font-semibold">{nextBillingDate}</dd></div></dl>
    <label className="mt-4 flex items-start gap-2 text-sm"><input required type="checkbox" name="confirmExistingStripe" value="yes" className="mt-1" /><span>I confirm this adopts the existing Stripe subscription only. It does not run a card transaction or change the customer’s Stripe plan.</span></label>
    {state.error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
    {state.message ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p> : null}
    <button disabled={pending} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Checking Stripe…" : "Reconcile and connect existing Stripe billing"}</button>
  </form>;
}
