"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  addCanonicalDraftItemAction,
  scheduleCanonicalDraftItemEndAction,
  scheduleCanonicalDraftRateAction,
  updateCanonicalDraftItemAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";

function Feedback({ state }: { state: CanonicalSubscriptionFormState }) {
  if (state.error) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p>;
  if (state.message) return <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p>;
  return null;
}

function useRefreshOnSuccess(state: CanonicalSubscriptionFormState) {
  const router = useRouter();
  useEffect(() => {
    if (state.message) router.refresh();
  }, [router, state.message]);
}

export function AddCanonicalDraftItemForm({
  subscriptionId,
  nextBillingDate,
  defaultAmount,
}: {
  subscriptionId: string;
  nextBillingDate: string;
  defaultAmount: string;
}) {
  const [state, action, pending] = useActionState(addCanonicalDraftItemAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700"><input type="hidden" name="subscriptionId" value={subscriptionId} /><div className="flex flex-col gap-1"><h3 className="font-semibold">Add draft billable service</h3><p className="text-sm text-zinc-500">The recurring effective date defaults to the next renewal. No device assignment is changed.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Service label<input required name="label" className={inputClass} placeholder="Vehicle A tracking" /></label><label className="text-sm font-medium">Cycle amount (EC$)<input required name="agreedAmountPerCycle" inputMode="decimal" defaultValue={defaultAmount} className={inputClass} /></label><label className="text-sm font-medium">Price type<select name="classification" defaultValue="standard" className={inputClass}><option value="standard">Standard</option><option value="negotiated">Negotiated</option></select></label><label className="text-sm font-medium">Activation date<input type="date" name="serviceActivatedDate" className={inputClass} /></label><label className="text-sm font-medium">Recurring effective date<input type="date" name="billingEffectiveFrom" defaultValue={nextBillingDate} className={inputClass} /></label><label className="text-sm font-medium">Optional end date<input type="date" name="billingEffectiveUntil" className={inputClass} /></label><label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Commercial note<input name="changeReason" className={inputClass} placeholder="Reason for negotiated rate or service note" /></label></div><div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">Effective-date preview: recurring billing is configured for {nextBillingDate}. The entered cycle amount becomes the expected recurring impact after server validation.</div><Feedback state={state} /><button disabled={pending} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Adding…" : "Add draft service"}</button></form>;
}

export function EditCanonicalDraftItemForm({ item }: { item: { id: string; subscriptionId: string; label: string; notes: string; serviceActivatedDate: string; billingEffectiveFrom: string } }) {
  const [state, action, pending] = useActionState(updateCanonicalDraftItemAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} className="space-y-3"><input type="hidden" name="subscriptionId" value={item.subscriptionId} /><input type="hidden" name="subscriptionItemId" value={item.id} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Service label<input required name="label" defaultValue={item.label} className={inputClass} /></label><label className="text-sm font-medium">Activation date<input type="date" name="serviceActivatedDate" defaultValue={item.serviceActivatedDate} className={inputClass} /></label><label className="text-sm font-medium">Billing effective from<input type="date" name="billingEffectiveFrom" defaultValue={item.billingEffectiveFrom} className={inputClass} /></label><label className="text-sm font-medium sm:col-span-2">Notes<input name="notes" defaultValue={item.notes} className={inputClass} /></label></div><Feedback state={state} /><button disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">{pending ? "Saving…" : "Save commercial details"}</button></form>;
}

export function ScheduleCanonicalDraftRateForm({ itemId, subscriptionId, nextBillingDate, currentAmount }: { itemId: string; subscriptionId: string; nextBillingDate: string; currentAmount: string }) {
  const [state, action, pending] = useActionState(scheduleCanonicalDraftRateAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} className="space-y-3"><input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={itemId} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">New cycle amount (EC$)<input required name="agreedAmountPerCycle" inputMode="decimal" defaultValue={currentAmount} className={inputClass} /></label><label className="text-sm font-medium">Effective from<input required type="date" name="effectiveFrom" defaultValue={nextBillingDate} className={inputClass} /></label><label className="text-sm font-medium">Classification<select name="classification" defaultValue="negotiated" className={inputClass}><option value="negotiated">Negotiated</option><option value="standard">Standard</option></select></label><label className="text-sm font-medium">Reason<input required name="changeReason" className={inputClass} placeholder="Approved rate change" /></label></div><p className="text-xs text-zinc-500">Preview: the existing open rate will end when this effective-dated rate begins. The server rejects overlaps.</p><Feedback state={state} /><button disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">{pending ? "Scheduling…" : "Schedule draft rate"}</button></form>;
}

export function ScheduleCanonicalDraftItemEndForm({ itemId, subscriptionId }: { itemId: string; subscriptionId: string }) {
  const [state, action, pending] = useActionState(scheduleCanonicalDraftItemEndAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} className="space-y-3"><input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={itemId} /><label className="block text-sm font-medium">End billing on<input required type="date" name="effectiveUntil" className={inputClass} /></label><Feedback state={state} /><button disabled={pending} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">{pending ? "Scheduling…" : "Schedule draft end"}</button></form>;
}
