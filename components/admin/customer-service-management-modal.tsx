"use client";

import { useEffect, useRef, useState } from "react";

import {
  ScheduleCanonicalDraftItemEndForm,
  ScheduleCanonicalDraftRateForm,
} from "@/components/admin/canonical-subscription-draft-forms";
import {
  CanonicalServiceHardwareReplacementForm,
  CanonicalServiceTransferForm,
} from "@/components/admin/canonical-subscription-operations-form";

type Props = {
  subscriptionId: string;
  subscriptionItemId: string;
  serviceLabel: string;
  nextBillingDate: string;
  currentAmount: string;
  replacementAssignments: { id: string; label: string }[];
  targetSubscriptions: { id: string; label: string }[];
};

export function CustomerServiceManagementModal({
  subscriptionId,
  subscriptionItemId,
  serviceLabel,
  nextBillingDate,
  currentAmount,
  replacementAssignments,
  targetSubscriptions,
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
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <ScheduleCanonicalDraftRateForm itemId={subscriptionItemId} subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} currentAmount={currentAmount} />
          <ScheduleCanonicalDraftItemEndForm itemId={subscriptionItemId} subscriptionId={subscriptionId} />
          <CanonicalServiceHardwareReplacementForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignments={replacementAssignments} />
          <CanonicalServiceTransferForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} currentAmount={currentAmount} targetSubscriptions={targetSubscriptions} />
        </div>
      </div>
    </div> : null}
  </>;
}
