"use client";

import { useActionState } from "react";

import { updateSubscriptionOption } from "@/app/admin/subscription-options/actions";
import type { SubscriptionOptionFormState } from "@/app/admin/subscription-options/actions";
import { formatPlanTerm } from "@/lib/subscription-options/display";

const initialState: SubscriptionOptionFormState = { error: null };

function fieldClass() {
  return "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
}

export function SubscriptionOptionForm({
  initial,
}: {
  initial: { id: string; durationMonths: number; priceUsd: string; isActive: boolean };
}) {
  const [state, formAction, pending] = useActionState(updateSubscriptionOption, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={initial.id} />
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      ) : null}
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Plan term</p>
        <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">{formatPlanTerm(initial.durationMonths)}</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Terms are fixed; only the price below can be changed.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="so-price">
          Price (USD)
        </label>
        <input
          id="so-price"
          name="priceUsd"
          type="number"
          required
          min={0.01}
          step={0.01}
          defaultValue={initial.priceUsd}
          className={fieldClass()}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial.isActive}
          value="true"
          className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
        />
        Active (shown on public registration form)
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
