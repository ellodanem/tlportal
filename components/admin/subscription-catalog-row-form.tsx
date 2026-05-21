"use client";

import { useActionState } from "react";

import {
  updateCatalogStripePriceAction,
  type CatalogPriceFormState,
} from "@/app/admin/subscription-options/catalog-actions";
import { catalogTierLabel } from "@/lib/domain/billing-catalog";
import { formatPlanTerm } from "@/lib/subscription-options/display";

const initial: CatalogPriceFormState = { error: null };

export function SubscriptionCatalogRowForm({
  id,
  monthlyRateXcd,
  durationMonths,
  stripePriceId,
  envHint,
}: {
  id: string;
  monthlyRateXcd: number;
  durationMonths: number;
  stripePriceId: string | null;
  envHint: string;
}) {
  const [state, action, pending] = useActionState(updateCatalogStripePriceAction, initial);

  return (
    <form action={action} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="stripePriceId"
        defaultValue={stripePriceId ?? ""}
        placeholder={`price_… or ${envHint}`}
        className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
        title={`${catalogTierLabel(monthlyRateXcd)} · ${formatPlanTerm(durationMonths)}`}
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
      >
        {pending ? "…" : "Save"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      {state.ok ? <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved</span> : null}
    </form>
  );
}
