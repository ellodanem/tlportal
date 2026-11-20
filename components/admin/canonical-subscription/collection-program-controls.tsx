"use client";

import { useActionState } from "react";

import {
  armCollectionProgramAction,
  cancelCollectionProgramAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};

export function ArmCollectionProgramForm({
  subscriptionId,
  cardLinkDate,
  firstChargeDate,
}: {
  subscriptionId: string;
  cardLinkDate: string;
  firstChargeDate: string;
}) {
  const [state, action, pending] = useActionState(armCollectionProgramAction, initialState);
  return (
    <form action={action} className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <h3 className="text-sm font-semibold">Ask three days before the first charge</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        On {cardLinkDate} TL Portal sends the card-on-file Checkout (save card, charge {firstChargeDate}). If there is still no card on {firstChargeDate}, it sends a pay-now Checkout for this subscription. If that window has already started, the first link is sent now.
      </p>
      {state.error ? <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      {state.message ? <p role="status" className="mt-3 text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
      <button disabled={pending} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Arming…" : "Arm this program"}
      </button>
    </form>
  );
}

export function CancelCollectionProgramForm({ subscriptionId }: { subscriptionId: string }) {
  const [state, action, pending] = useActionState(cancelCollectionProgramAction, initialState);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      {state.error ? <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      {state.message ? <p role="status" className="mb-3 text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
      <button disabled={pending} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
        {pending ? "Canceling…" : "Cancel program"}
      </button>
    </form>
  );
}
