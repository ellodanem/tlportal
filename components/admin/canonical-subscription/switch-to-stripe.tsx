"use client";

import { useActionState, useState, useTransition } from "react";

import {
  findLinkableStripeSubscriptionsAction,
  linkExistingStripeSubscriptionAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import type { LinkableStripeResult } from "@/lib/services/canonical-stripe-link-service";

const initialState: CanonicalSubscriptionFormState = {};

type Found = LinkableStripeResult & { error?: string };

/**
 * Switch an active Recurring-invoice subscription to Stripe card billing by linking a Stripe
 * subscription that already exists. TL Portal only reads Stripe; the client's card
 * subscription is left exactly as it is.
 */
export function SwitchToStripe({ subscriptionId }: { subscriptionId: string }) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [selected, setSelected] = useState("");
  const [finding, startFinding] = useTransition();
  const [state, action, linking] = useActionState(linkExistingStripeSubscriptionAction, initialState);

  function find() {
    setSelected("");
    startFinding(async () => setFound(await findLinkableStripeSubscriptionsAction(subscriptionId)));
  }

  if (state.message) {
    return <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">{state.message}</p>;
  }

  if (!open) {
    return (
      <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="text-sm font-semibold">Switch to Stripe</h3>
        <p className="mt-1 text-xs text-zinc-500">For a client who already pays by card through a Stripe subscription. TL Portal links it, checks it matches these services, and stops the recurring invoices. Nothing changes in Stripe.</p>
        <button type="button" onClick={() => { setOpen(true); find(); }} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/30">Link a Stripe subscription</button>
      </div>
    );
  }

  const candidates = found?.candidates ?? [];
  const picked = candidates.find((entry) => entry.id === selected) ?? null;
  const manualMode = selected === "__manual";
  // Pasting an ID is offered when the lookup worked, or when it only failed for lack of a linked Stripe customer.
  const canPaste = Boolean(found) && !found?.error
    && (found?.blockers.length === 0 || (found?.stripeCustomerId === null && Boolean(found?.blockers.some((entry) => entry.includes("Paste")))));

  return (
    <form action={action} className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="externalSubscriptionId" value={manualMode ? "" : selected} />
      <h3 className="text-sm font-semibold">Link an existing Stripe subscription</h3>

      {finding && !found ? <p className="mt-2 text-sm text-zinc-500">Looking up this customer&apos;s Stripe subscriptions…</p> : null}
      {found?.error ? <p role="alert" className="mt-2 text-sm text-red-700">{found.error}</p> : null}
      {found?.blockers.length ? (
        <ul role="alert" className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">{found.blockers.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      ) : null}

      {candidates.length ? (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stripe subscriptions for this customer</legend>
          {candidates.map((entry) => (
            <label key={entry.id} className={`block rounded-lg border p-3 text-sm ${entry.eligible ? "cursor-pointer border-zinc-300 dark:border-zinc-700" : "border-zinc-200 opacity-80 dark:border-zinc-800"}`}>
              <span className="flex items-start gap-3">
                <input type="radio" name="pick" disabled={!entry.eligible} checked={selected === entry.id} onChange={() => setSelected(entry.id)} className="mt-1 size-4" />
                <span className="min-w-0">
                  <span className="block font-medium">{entry.summary}</span>
                  <span className="block break-all text-xs text-zinc-500">{entry.id} · {entry.status}{entry.currentPeriodEnd ? ` · renews ${entry.currentPeriodEnd}` : ""}</span>
                  {entry.eligible ? (
                    <span className="mt-1 block text-xs font-semibold text-emerald-700 dark:text-emerald-400">Matches these services exactly</span>
                  ) : (
                    <span className="mt-1 block text-xs text-amber-800 dark:text-amber-300">Cannot be linked: {entry.issues.join(" ")}</span>
                  )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : found && !found.blockers.length && !found.error ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">No active Stripe subscriptions were found for this customer.</p>
      ) : null}

      {canPaste ? (
        <div className="mt-3">
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="pick" checked={manualMode} onChange={() => setSelected("__manual")} className="size-4" /> Paste a Stripe subscription ID instead</label>
          {manualMode ? <input name="externalSubscriptionIdManual" placeholder="sub_..." autoComplete="off" className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" /> : null}
        </div>
      ) : null}

      {selected ? (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmLinkStripe" value="yes" className="mt-1 size-4" />
          <span>
            Switch to Stripe{picked ? ` using ${picked.id}` : ""}. Stripe will charge the card on the renewal date, TL Portal will stop its recurring invoices for this subscription, and Stripe payments will be recorded here. This does not change anything in Stripe.
          </span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={!selected || linking} className="inline-flex min-h-11 items-center rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{linking ? "Linking…" : "Switch to Stripe"}</button>
        <button type="button" onClick={find} disabled={finding} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">{finding ? "Checking…" : "Check again"}</button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-600">Cancel</button>
      </div>
      {state.error ? <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}
