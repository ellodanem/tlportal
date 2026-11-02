"use client";

import { useActionState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  pauseCanonicalServiceAssignmentAction,
  replaceCanonicalServiceHardwareAction,
  resumeCanonicalServiceAssignmentAction,
  transitionCanonicalSubscriptionLifecycleAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import { SUBSCRIPTION_LIFECYCLE_ACTIONS } from "@/lib/domain/canonical-subscription-navigation";
import {
  SERVICE_PAUSE_DISPOSITION_LABEL,
  SERVICE_PAUSE_REASON_LABEL,
  SERVICE_PAUSE_REASONS,
} from "@/lib/domain/service-pause";

const initialState: CanonicalSubscriptionFormState = {};
export const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";

export function Feedback({ state }: { state: CanonicalSubscriptionFormState }) {
  if (state.error) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p>;
  if (state.message) return <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p>;
  return null;
}

function confirmServiceOperation(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}
export function useRefreshOnSuccess(state: CanonicalSubscriptionFormState) {
  const router = useRouter();
  useEffect(() => { if (state.message) router.refresh(); }, [router, state.message]);
}

export function CanonicalSubscriptionLifecycleForm({ subscriptionId, lifecycleStatus }: { subscriptionId: string; lifecycleStatus: string }) {
  const options = SUBSCRIPTION_LIFECYCLE_ACTIONS[lifecycleStatus] ?? [];
  const [state, action, pending] = useActionState(transitionCanonicalSubscriptionLifecycleAction, initialState);
  useRefreshOnSuccess(state);
  if (!options.length) return null;
  return <form action={action} onSubmit={confirmServiceOperation("Apply this status change to the whole agreement?")} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
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

export function CanonicalServicePauseForm({
  subscriptionId,
  subscriptionItemId,
  assignmentId,
}: {
  subscriptionId: string;
  subscriptionItemId: string;
  assignmentId: string;
}) {
  const [state, action, pending] = useActionState(pauseCanonicalServiceAssignmentAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} onSubmit={confirmServiceOperation("Pause this service? It will not be billed from the next renewal, and the tracker disposition is recorded.")} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
    <input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={subscriptionItemId} /><input type="hidden" name="assignmentId" value={assignmentId} />
    <h3 className="font-semibold">Pause service</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Use for a temporary break. The service stays on the subscription but is not billed from the next renewal; the current period is not refunded or credited. The device is recorded as returned or in stock, and you can resume it later.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Reason<select required name="pauseReason" defaultValue="no_vehicle" className={inputClass}>{SERVICE_PAUSE_REASONS.map((reason) => <option key={reason} value={reason}>{SERVICE_PAUSE_REASON_LABEL[reason]}</option>)}</select></label>
      <label className="text-sm font-medium">Tracker disposition<select required name="deviceDisposition" defaultValue="returned" className={inputClass}>{Object.entries(SERVICE_PAUSE_DISPOSITION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2">Note (optional)<input name="pauseNote" className={inputClass} placeholder="Reason or collection note" /></label>
    </div>
    <Feedback state={state} />
    <button disabled={pending} className="mt-4 rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200">{pending ? "Pausing…" : "Pause service"}</button>
  </form>;
}

export function CanonicalServiceResumeForm({
  subscriptionId,
  subscriptionItemId,
  assignmentId,
  deviceLabel,
  billedByStripe,
}: {
  subscriptionId: string;
  subscriptionItemId: string;
  assignmentId: string;
  deviceLabel: string;
  billedByStripe: boolean;
}) {
  const [state, action, pending] = useActionState(resumeCanonicalServiceAssignmentAction, initialState);
  useRefreshOnSuccess(state);
  return <form action={action} onSubmit={confirmServiceOperation(`Resume service for ${deviceLabel}? The tracker is marked assigned again.`)} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
    <input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={subscriptionItemId} /><input type="hidden" name="assignmentId" value={assignmentId} />
    <h3 className="font-semibold">Resume service</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">This service is paused and is not being billed. Resuming marks {deviceLabel} assigned again and bills the service from the next renewal at its usual price. Nothing is invoiced or charged for the paused time.</p>
    {billedByStripe ? <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">Card billing: raise the Stripe vehicle quantity before the next charge. The Stripe check on this page shows the current numbers.</p> : null}
    <Feedback state={state} />
    <button disabled={pending} className="mt-4 min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? "Resuming…" : "Resume service"}</button>
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
  return <form action={action} onSubmit={confirmServiceOperation("Replace the hardware on this service from the chosen date? The previous assignment is kept as history.")} className="mt-3 grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-end dark:border-zinc-700">
    <input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="subscriptionItemId" value={subscriptionItemId} />
    <label className="text-sm font-medium">Replacement assignment<select required name="replacementAssignmentId" className={inputClass}><option value="">Choose active device / SIM</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}</select></label>
    <label className="text-sm font-medium">Replacement date<input required type="date" name="replacedOn" className={inputClass} /></label>
    <button disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">{pending ? "Saving…" : "Replace hardware"}</button>
    <div className="sm:col-span-3"><Feedback state={state} /></div>
  </form>;
}
