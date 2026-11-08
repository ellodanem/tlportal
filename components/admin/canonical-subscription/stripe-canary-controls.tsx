"use client";

import { useActionState, useState } from "react";

import {
  finalizeStripeCanaryAction,
  startStripeCanaryAction,
  undoStripeCanaryAction,
} from "@/app/admin/subscriptions/canonical/stripe-canary-actions";
import type { CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";
import type { LiveCanaryPanelState } from "@/lib/services/canonical-stripe-live-canary-service";

const initial: CanonicalSubscriptionFormState = {};
type Visible = Extract<LiveCanaryPanelState, { visible: true }>;

const QUESTIONS = (amount: string, currency: string, renewsOn: string): Array<[string, string]> => [
  ["confirmCustomer", "This is the right customer, and they have agreed to pay by card through Stripe."],
  ["confirmSubscription", "This is the right subscription with the right services."],
  ["confirmCharge", `I approve a real charge of ${currency} ${amount} each cycle (no tax).`],
  ["confirmMinimum", `I checked in Stripe that XCD card payments work and ${currency} ${amount} is above the account's minimum charge.`],
  ["confirmRenewal", `The renewal date ${renewsOn} is correct.`],
  ["confirmCancel", "I know how to cancel (cancel at period end, then verify in Stripe)."],
];

function Message({ state }: { state: CanonicalSubscriptionFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      {state.message ? <p role="status" className="mt-3 text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
    </>
  );
}

export function StripeCanaryControls({ subscriptionId, state }: { subscriptionId: string; state: Visible }) {
  const [startState, start, starting] = useActionState(startStripeCanaryAction, initial);
  const [finalState, finalize, finalizing] = useActionState(finalizeStripeCanaryAction, initial);
  const [undoState, undo, undoing] = useActionState(undoStripeCanaryAction, initial);
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);

  const blocked = Boolean(state.environmentIssue);

  if (state.linked) {
    return (
      <div>
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          <strong>Stripe is live.</strong> Subscription <span className="break-all font-mono text-xs">{state.linked.externalSubscriptionId}</span> is linked ({state.linked.providerStatus ?? "status pending"}).
        </p>
        {state.openSchedules > 0 ? (
          <form action={finalize} className="mt-3">
            <input type="hidden" name="subscriptionId" value={subscriptionId} />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">The paused recurring invoice schedules can now be ended for good.</p>
            <button disabled={finalizing} className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{finalizing ? "Finishing…" : "Finish: end the recurring invoices"}</button>
            <Message state={finalState} />
          </form>
        ) : null}
      </div>
    );
  }

  if (state.operation) {
    return (
      <div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Stripe Checkout created ({state.operation.status.replaceAll("_", " ")}).
          {state.checkout?.status === "complete" ? " The customer has completed it; waiting for Stripe to confirm the subscription." : ""}
          {state.checkout?.status === "expired" ? " This link has expired." : ""}
        </p>
        {state.operation.failureMessage ? <p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-300">{state.operation.failureMessage}</p> : null}
        {state.checkout?.url && state.checkout.status === "open" ? (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Send this link to the customer</p>
            <p className="mt-1 break-all text-xs text-violet-900 dark:text-violet-200">{state.checkout.url}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => { await navigator.clipboard.writeText(state.checkout!.url!); setCopied(true); }}
                className="inline-flex min-h-11 items-center rounded-lg border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-900 dark:border-violet-800 dark:text-violet-100"
              >{copied ? "Copied" : "Copy link"}</button>
              <a href={state.checkout.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">Open</a>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Nothing is charged until they complete it. Reload this page after they pay.</p>
          </div>
        ) : null}
        {state.checkoutIssue ? <p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-300">{state.checkoutIssue}</p> : null}
        {!state.checkout && !state.checkoutIssue && state.operation.status !== "completed" ? (
          <form action={start} className="mt-3">
            <input type="hidden" name="subscriptionId" value={subscriptionId} />
            {QUESTIONS("", "", "").map(([name]) => <input key={name} type="hidden" name={name} value="yes" />)}
            <input type="hidden" name="typed" value="CREATE" />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">The approval exists but no Checkout was created. You can retry safely; the same operation is reused.</p>
            <button disabled={starting || blocked} className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{starting ? "Retrying…" : "Retry creating the Checkout"}</button>
            <Message state={startState} />
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {state.environmentIssue ? (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-300"><strong>Not ready:</strong> {state.environmentIssue}</p>
      ) : null}
      {state.previewIssue ? <p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-300"><strong>Cannot propose:</strong> {state.previewIssue}</p> : null}

      {state.converted ? (
        <form action={undo} className="mt-2">
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <p className="text-sm text-amber-900 dark:text-amber-200">A previous attempt switched this subscription to Stripe but nothing was approved or sent. Undo it to go back to recurring invoices.</p>
          <button disabled={undoing} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200">{undoing ? "Undoing…" : "Undo the switch"}</button>
          <Message state={undoState} />
        </form>
      ) : null}

      {state.preview ? (
        <form action={start} className="mt-2">
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Charge</dt><dd className="font-semibold tabular-nums">{state.preview.currency} {state.preview.amount} / month ({state.preview.groups.join(" + ")})</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Renews on</dt><dd className="font-semibold">{state.preview.renewsOn}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Safety cap</dt><dd>{state.preview.currency} {state.preview.cap}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            TL Portal will switch this subscription to Stripe, <strong>pause its recurring invoices</strong>, and create one Stripe Checkout for the customer to enter their card. If the switch fails before Stripe is contacted, it is undone automatically.
          </p>
          <fieldset className="mt-3 space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Confirm each one</legend>
            {QUESTIONS(state.preview.amount, state.preview.currency, state.preview.renewsOn).map(([name, label]) => (
              <label key={name} className="flex items-start gap-2 text-sm"><input type="checkbox" name={name} value="yes" className="mt-1 size-4" /><span>{label}</span></label>
            ))}
          </fieldset>
          <label className="mt-3 block text-sm font-medium">Type CREATE to continue
            <input name="typed" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <button disabled={starting || blocked || typed.trim() !== "CREATE"} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{starting ? "Creating…" : "Create the Stripe Checkout"}</button>
          <Message state={startState} />
        </form>
      ) : null}
    </div>
  );
}
