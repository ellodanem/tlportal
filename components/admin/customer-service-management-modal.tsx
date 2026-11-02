"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ScheduleCanonicalDraftItemEndForm,
  ScheduleCanonicalDraftRateForm,
} from "@/components/admin/canonical-subscription-draft-forms";
import { CanonicalServicePauseForm, CanonicalServiceResumeForm } from "@/components/admin/canonical-subscription-operations-form";

type Props = {
  subscriptionId: string;
  subscriptionItemId: string;
  serviceLabel: string;
  nextBillingDate: string;
  currentAmount: string;
  /** The dedicated page for multi-step or high-risk operations (hardware, transfer, vehicle sale). */
  servicePageHref: string;
  assignment?: { id: string; deviceId: string; deviceLabel: string; status: string } | null;
  /** Adds the Stripe quantity reminder to the resume form; the action's result message always includes it. */
  billedByStripe?: boolean;
};

/**
 * Quick actions for ONE service: change its price, schedule its end, or pause it.
 * Anything multi-step or high-risk (hardware replacement, transfer, removal on vehicle sale)
 * lives on the service page, so each operation has exactly one authoritative home.
 */
export function CustomerServiceManagementModal({
  subscriptionId,
  subscriptionItemId,
  serviceLabel,
  nextBillingDate,
  currentAmount,
  servicePageHref,
  assignment = null,
  billedByStripe = false,
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
    <button ref={manageButtonRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="min-h-11 w-fit rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30 dark:focus-visible:ring-offset-zinc-900">Quick actions</button>
    {open ? <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 text-left shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">{serviceLabel}</h2>
            <p className="mt-1 text-sm text-zinc-500">Change the price, schedule an end, or pause or resume the tracker. Existing invoices, price history and device history are preserved.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" aria-label={`Close quick actions for ${serviceLabel}`}>
            <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section aria-label="Schedule a price change"><h3 className="mb-3 font-semibold">Price change</h3><ScheduleCanonicalDraftRateForm itemId={subscriptionItemId} subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} currentAmount={currentAmount} /></section>
          <section aria-label="Schedule the end of this service"><h3 className="mb-3 font-semibold">End this service</h3><ScheduleCanonicalDraftItemEndForm itemId={subscriptionItemId} subscriptionId={subscriptionId} /></section>
        </div>
        {assignment ? <section aria-label="Pause service" className="mt-5">
          {assignment.status === "suspended"
            ? <CanonicalServiceResumeForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignmentId={assignment.id} deviceLabel={assignment.deviceLabel} billedByStripe={billedByStripe} />
            : <CanonicalServicePauseForm subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignmentId={assignment.id} />}
        </section> : null}
        <p className="mt-6 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">Replacing hardware, transferring to another subscription, or removing the tracker after a vehicle sale are on the <Link href={servicePageHref} className="font-semibold text-emerald-700 underline dark:text-emerald-400">service page</Link>, where you can review the current assignment first.</p>
      </div>
    </div> : null}
  </>;
}
