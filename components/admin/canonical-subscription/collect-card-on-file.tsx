"use client";

import { useActionState, useState } from "react";

import {
  startStripeCardOnFileCheckoutAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import type { CardOnFilePanelState } from "@/lib/services/canonical-stripe-card-on-file-service";

const initialState: CanonicalSubscriptionFormState = {};

function displayDate(value: string | null): string {
  if (!value) return "the renewal date";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

export function CollectCardOnFileControls({
  subscriptionId,
  state,
}: {
  subscriptionId: string;
  state: CardOnFilePanelState;
}) {
  const [formState, action, pending] = useActionState(startStripeCardOnFileCheckoutAction, initialState);
  const [copied, setCopied] = useState(false);
  const firstCharge = displayDate(state.firstChargeDate);
  const amount = state.recurringTotal && state.currency ? `${state.currency} ${state.recurringTotal}` : "the recurring amount";

  if (state.checkout?.url) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
        <h3 className="text-sm font-semibold">Checkout sent — card not saved yet</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Send this link to the customer. Stripe stores the card and charges {amount} on {firstCharge}, not today.
        </p>
        <p className="mt-2 break-all text-xs text-zinc-700 dark:text-zinc-200">{state.checkout.url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => { await navigator.clipboard.writeText(state.checkout!.url!); setCopied(true); }}
            className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:text-emerald-100"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={state.checkout.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700"
          >
            Open
          </a>
        </div>
      </div>
    );
  }

  if (state.blockers.length) {
    return (
      <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="text-sm font-semibold">Collect card, bill later</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
          {state.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <h3 className="text-sm font-semibold">Collect card, bill later</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Send a Stripe Checkout link. The customer saves a card now. The first charge is {amount} on {firstCharge}. Service can start today.
      </p>
      {state.leftoverSummary ? (
        <p className={`mt-3 rounded-lg p-3 text-sm ${state.requiresExplicitCancel ? "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "bg-zinc-50 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"}`}>
          {state.leftoverSummary}
        </p>
      ) : null}
      {state.liveSubscriptions.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          {state.liveSubscriptions.map((entry) => (
            <li key={entry.id} className="break-all">{entry.id} · {entry.status}{entry.currentPeriodEnd ? ` · through ${entry.currentPeriodEnd}` : ""}</li>
          ))}
        </ul>
      ) : null}
      {state.canceledSubscriptions.length && !state.requiresExplicitCancel ? (
        <p className="mt-2 text-xs text-zinc-500">Previous Stripe subscription {state.canceledSubscriptions[0]!.id} is already canceled.</p>
      ) : null}
      <fieldset className="mt-3 space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmDelayedCharge" value="yes" className="mt-1 size-4" />
          <span>Do not charge today. First charge is {firstCharge}.</span>
        </label>
        {state.requiresExplicitCancel ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmCancelExisting" value="yes" className="mt-1 size-4" />
            <span>Cancel the live Stripe subscription immediately and void open invoices so this customer is not billed twice. History stays in Stripe.</span>
          </label>
        ) : null}
      </fieldset>
      {state.checkoutFailure ? <p role="alert" className="mt-3 text-sm text-amber-800 dark:text-amber-200">{state.checkoutFailure}</p> : null}
      {formState.error ? <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{formState.error}</p> : null}
      {formState.message ? <p role="status" className="mt-3 text-sm text-emerald-800 dark:text-emerald-300">{formState.message}</p> : null}
      <button disabled={pending} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Creating Checkout…" : state.requiresExplicitCancel ? "Cancel leftover Stripe and send Checkout" : "Send card-on-file Checkout"}
      </button>
    </form>
  );
}
