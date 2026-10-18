"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  replaceCanonicalServiceHardwareAction,
  transferCanonicalServiceAction,
  transitionCanonicalSubscriptionLifecycleAction,
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

const lifecycleTargets: Record<string, { value: "active" | "paused" | "ended" | "canceled"; label: string }[]> = {
  pending_activation: [{ value: "active", label: "Mark active" }, { value: "canceled", label: "Cancel agreement" }],
  active: [{ value: "paused", label: "Pause agreement" }, { value: "ended", label: "End agreement" }, { value: "canceled", label: "Cancel agreement" }],
  paused: [{ value: "active", label: "Reactivate agreement" }, { value: "ended", label: "End agreement" }, { value: "canceled", label: "Cancel agreement" }],
};

export function CanonicalSubscriptionLifecycleForm({ subscriptionId, lifecycleStatus }: { subscriptionId: string; lifecycleStatus: string }) {
  const options = lifecycleTargets[lifecycleStatus] ?? [];
  const [state, action, pending] = useActionState(transitionCanonicalSubscriptionLifecycleAction, initialState);
  useRefreshOnSuccess(state);
  if (!options.length) return null;
  return <form action={action} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <h3 className="font-semibold">Agreement lifecycle</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Changes are staff-audited. They preserve historical invoices, payments, and service records; they do not create a financial or provider operation.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
      <label className="text-sm font-medium">Outcome<select required name="targetLifecycle" className={inputClass}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="text-sm font-medium">Staff reason<input required name="confirmationNote" className={inputClass} placeholder="Commercial or service reason" /></label>
      <button disabled={pending} className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200">{pending ? "Saving…" : "Confirm change"}</button>
    </div>
    <Feedback state={state} />
  </form>;
}

export function CanonicalServiceHardwareReplacementForm({
  subscriptionId,
  subscriptionItemId,
  assignments,
}: {
  subscriptionId: string;
  subscriptionItemId: string;
  assignments: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(replaceCanonicalServiceHardwareAction, initialState);
  useRefreshOnSuccess(state);
  if (!assignments.length) return <p className="mt-3 text-xs text-zinc-500">No unlinked active service assignments are available for a hardware replacement.</p>;
  return <form action={action} className="mt-3 grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-end dark:border-zinc-700">
    <input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={subscriptionItemId} />
    <label className="text-sm font-medium">Replacement assignment<select required name="replacementAssignmentId" className={inputClass}><option value="">Choose active device / SIM</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}</select></label>
    <label className="text-sm font-medium">Replacement date<input required type="date" name="replacedOn" className={inputClass} /></label>
    <button disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">{pending ? "Saving…" : "Replace hardware"}</button>
    <div className="sm:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function CanonicalServiceTransferForm({
  subscriptionId,
  subscriptionItemId,
  currentAmount,
  targetSubscriptions,
}: {
  subscriptionId: string;
  subscriptionItemId: string;
  currentAmount: string;
  targetSubscriptions: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(transferCanonicalServiceAction, initialState);
  useRefreshOnSuccess(state);
  if (!targetSubscriptions.length) return <p className="mt-3 text-xs text-zinc-500">No other manageable canonical agreement exists for this customer.</p>;
  return <form action={action} className="mt-3 grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-700">
    <input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={subscriptionItemId} />
    <label className="text-sm font-medium">Transfer to agreement<select required name="targetSubscriptionId" className={inputClass}><option value="">Choose agreement</option>{targetSubscriptions.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
    <label className="text-sm font-medium">Transfer date<input required type="date" name="transferDate" className={inputClass} /></label>
    <label className="text-sm font-medium">Successor cycle amount (EC$)<input required name="agreedAmountPerCycle" defaultValue={currentAmount} inputMode="decimal" className={inputClass} /></label>
    <label className="text-sm font-medium">Price type<select name="classification" defaultValue="negotiated" className={inputClass}><option value="negotiated">Negotiated</option><option value="standard">Standard</option></select></label>
    <label className="text-sm font-medium sm:col-span-2">Commercial reason<input required name="changeReason" className={inputClass} placeholder="Approved service transfer" /></label>
    <p className="text-xs text-zinc-500 sm:col-span-2">The source service ends on the transfer date and a successor service is created under the chosen agreement. Historical invoices and rates are not rewritten.</p>
    <div className="sm:col-span-2"><Feedback state={state} /></div>
    <button disabled={pending} className="justify-self-start rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300">{pending ? "Transferring…" : "Transfer service"}</button>
  </form>;
}
