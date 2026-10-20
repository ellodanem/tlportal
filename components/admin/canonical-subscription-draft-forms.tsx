"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
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
  useEffect(() => { if (state.message) router.refresh(); }, [router, state.message]);
}

function confirmCommercialChange(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

export function AddCanonicalDraftItemForm({ subscriptionId, nextBillingDate, defaultAmount }: { subscriptionId: string; nextBillingDate: string; defaultAmount: string }) {
  const [state, action, pending] = useActionState(addCanonicalDraftItemAction, initialState);
  const [open, setOpen] = useState(false);
  useRefreshOnSuccess(state);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <><button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"><svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>Add billable service</button>{open ? <div role="dialog" aria-modal="true" aria-labelledby="add-service-title" className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 p-4 sm:items-center sm:justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900"><div className="flex items-start justify-between gap-4"><div><h2 id="add-service-title" className="text-lg font-semibold tracking-tight">Add billable service</h2><p className="mt-1 text-sm text-zinc-500">Recurring effective date defaults to the next renewal. No device assignment is changed.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" aria-label="Close add billable service dialog"><svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg></button></div><form action={action} className="mt-5"><input type="hidden" name="subscriptionId" value={subscriptionId} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Service label<input required name="label" className={inputClass} placeholder="Vehicle A tracking" /></label><label className="text-sm font-medium">Cycle amount (EC$)<input required name="agreedAmountPerCycle" inputMode="decimal" defaultValue={defaultAmount} className={inputClass} /></label><label className="text-sm font-medium">Price type<select name="classification" defaultValue="standard" className={inputClass}><option value="standard">Standard</option><option value="negotiated">Negotiated</option></select></label><label className="text-sm font-medium">Activation date<input type="date" name="serviceActivatedDate" className={inputClass} /></label><label className="text-sm font-medium">Recurring effective date<input type="date" name="billingEffectiveFrom" defaultValue={nextBillingDate} className={inputClass} /></label><label className="text-sm font-medium">Optional end date<input type="date" name="billingEffectiveUntil" className={inputClass} /></label><label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Commercial note<input name="changeReason" className={inputClass} placeholder="Reason for negotiated rate or service note" /></label></div><div className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">Effective-date preview: recurring billing is configured for {nextBillingDate}. The entered cycle amount becomes the expected recurring impact after server validation.</div><Feedback state={state} /><div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">Cancel</button><button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Adding..." : "Add service"}</button></div></form></div></div> : null}</>;
}

export function EditCanonicalDraftItemForm({ item }: { item: { id: string; subscriptionId: string; label: string; notes: string; serviceActivatedDate: string; billingEffectiveFrom: string } }) {
  const [state, action, pending] = useActionState(updateCanonicalDraftItemAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} className="space-y-3"><input type="hidden" name="subscriptionId" value={item.subscriptionId} /><input type="hidden" name="subscriptionItemId" value={item.id} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Service label<input required name="label" defaultValue={item.label} className={inputClass} /></label><label className="text-sm font-medium">Activation date<input type="date" name="serviceActivatedDate" defaultValue={item.serviceActivatedDate} className={inputClass} /></label><label className="text-sm font-medium">Billing effective from<input type="date" name="billingEffectiveFrom" defaultValue={item.billingEffectiveFrom} className={inputClass} /></label><label className="text-sm font-medium sm:col-span-2">Notes<input name="notes" defaultValue={item.notes} className={inputClass} /></label></div><Feedback state={state} /><button disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">{pending ? "Saving..." : "Save commercial details"}</button></form>;
}

export function ScheduleCanonicalDraftRateForm({ itemId, subscriptionId, nextBillingDate, currentAmount }: { itemId: string; subscriptionId: string; nextBillingDate: string; currentAmount: string }) {
  const [state, action, pending] = useActionState(scheduleCanonicalDraftRateAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} onSubmit={confirmCommercialChange("Schedule this rate change? It will preserve existing rate history and affect future billing from the selected date.")} className="space-y-3"><input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={itemId} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">New cycle amount (EC$)<input required name="agreedAmountPerCycle" inputMode="decimal" defaultValue={currentAmount} className={inputClass} /></label><label className="text-sm font-medium">Effective from<input required type="date" name="effectiveFrom" defaultValue={nextBillingDate} className={inputClass} /></label><label className="text-sm font-medium">Classification<select name="classification" defaultValue="negotiated" className={inputClass}><option value="negotiated">Negotiated</option><option value="standard">Standard</option></select></label><label className="text-sm font-medium">Reason<input required name="changeReason" className={inputClass} placeholder="Approved rate change" /></label></div><p className="text-xs text-zinc-500">The existing open rate ends when this effective-dated rate begins. The server rejects overlaps.</p><Feedback state={state} /><button disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">{pending ? "Scheduling..." : "Schedule rate"}</button></form>;
}

export function ScheduleCanonicalDraftItemEndForm({ itemId, subscriptionId }: { itemId: string; subscriptionId: string }) {
  const [state, action, pending] = useActionState(scheduleCanonicalDraftItemEndAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} onSubmit={confirmCommercialChange("Schedule the end of this service? Future billing will stop at the selected date, while historical records remain unchanged.")} className="space-y-3"><input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={itemId} /><label className="block text-sm font-medium">End billing on<input required type="date" name="effectiveUntil" className={inputClass} /></label><Feedback state={state} /><button disabled={pending} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">{pending ? "Scheduling..." : "Schedule service end"}</button></form>;
}
