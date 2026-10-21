"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ScheduleCanonicalDraftItemEndForm,
  ScheduleCanonicalDraftRateForm,
  EditCanonicalDraftItemForm,
} from "@/components/admin/canonical-subscription-draft-forms";
import {
  CanonicalServiceHardwareReplacementForm,
  CanonicalServicePauseForm,
  CanonicalServiceTransferForm,
  CanonicalVehicleSaleRemovalForm,
} from "@/components/admin/canonical-subscription-operations-form";

type Props = {
  subscriptionId: string;
  subscriptionItemId: string;
  serviceLabel: string;
  nextBillingDate: string;
  currentAmount: string;
  replacementAssignments: { id: string; label: string }[];
  targetSubscriptions: { id: string; label: string }[];
  assignment?: { id: string; deviceId: string; deviceLabel: string; status: string } | null;
  draftItem?: { label: string; notes: string; serviceActivatedDate: string; billingEffectiveFrom: string } | null;
};

export function CustomerServiceManagementModal({
  subscriptionId,
  subscriptionItemId,
  serviceLabel,
  nextBillingDate,
  currentAmount,
  replacementAssignments,
  targetSubscriptions,
  assignment = null,
  draftItem = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const titleId = `manage-service-title-${subscriptionItemId}`;

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) manageButtonRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <>
    <button ref={manageButtonRef} type="button" onClick={() => setOpen(true)} className="w-fit rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30 dark:focus-visible:ring-offset-zinc-900">Manage</button>
    {open ? <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Manage {serviceLabel}</h2>
            <p className="mt-1 text-sm text-zinc-500">Schedule service changes while preserving existing invoices, price history, and device-assignment history.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" aria-label={`Close management dialog for ${serviceLabel}`}>
            <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {assignment ? <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/15">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">Tracker operations</h3><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{assignment.deviceLabel} · handle the installed tracker and its service together.</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/devices/${assignment.deviceId}/replace`} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">Replace tracker</Link><Link href={`/admin/devices/${assignment.deviceId}/swap-sim`} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">Swap SIM</Link></div></div>
          {assignment.status === "suspended" ? <p className="mt-4 rounded-lg bg-white p-3 text-sm text-amber-900 dark:bg-zinc-900 dark:text-amber-200">This tracker assignment is already paused. Use the device assignment if it needs to be resumed.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2"><CanonicalServicePauseForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignmentId={assignment.id} /><CanonicalVehicleSaleRemovalForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignmentId={assignment.id} /></div>}
        </section> : null}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">{draftItem ? <div className="lg:col-span-2"><EditCanonicalDraftItemForm item={{ id: subscriptionItemId, subscriptionId, ...draftItem }} /></div> : null}
          <ScheduleCanonicalDraftRateForm itemId={subscriptionItemId} subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} currentAmount={currentAmount} />
          <ScheduleCanonicalDraftItemEndForm itemId={subscriptionItemId} subscriptionId={subscriptionId} />
          <CanonicalServiceHardwareReplacementForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignments={replacementAssignments} />
          <CanonicalServiceTransferForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} currentAmount={currentAmount} targetSubscriptions={targetSubscriptions} />
        </div>
      </div>
    </div> : null}
  </>;
}
