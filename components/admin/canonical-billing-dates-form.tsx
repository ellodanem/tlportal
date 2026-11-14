"use client";

import { useActionState } from "react";

import { correctCanonicalBillingDatesAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export function CanonicalBillingDatesForm({
  subscriptionId,
  startDate,
  renewalDate,
  intervalMonths,
  bare = false,
}: {
  subscriptionId: string;
  startDate: string;
  renewalDate: string;
  intervalMonths: number;
  /** Drop the card chrome when the form is already inside a dialog. */
  bare?: boolean;
}) {
  const [state, action, pending] = useActionState(correctCanonicalBillingDatesAction, initialState);
  return (
    <form action={action} className={bare ? "flex flex-col gap-4" : "mt-4 flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"}>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Start date
          <input type="date" name="commercialStartDate" defaultValue={startDate} required className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">When this billing cycle began.</span>
        </label>
        <label className="text-sm font-medium">
          Next renewal date
          <input type="date" name="nextBillingDate" defaultValue={renewalDate} required className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">Must be after the start date. Extra unpaid months are allowed so renewals can line up, up to {intervalMonths * 2} months later.</span>
        </label>
      </div>
      <label className="text-sm font-medium">
        Reason
        <input type="text" name="reason" required minLength={3} maxLength={300} placeholder="e.g. Start date entered as June instead of May" className={inputClass} />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4" />
        <span>I confirm nothing has been invoiced or charged from the current dates.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="min-h-11 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300">
          {pending ? "Saving…" : "Correct billing dates"}
        </button>
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
        {state.message ? <p role="status" className="text-sm text-emerald-700">{state.message}</p> : null}
      </div>
    </form>
  );
}
