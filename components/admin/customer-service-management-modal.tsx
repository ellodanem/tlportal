"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { displayDate } from "@/components/admin/canonical-subscription/format";
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
  /** ISO currency code, used when reading the new price back to the user. */
  currency?: string;
  /** The rate in force today, as text (e.g. "EC$25.00 / month"). */
  currentRateText?: string;
  /** A price change that is already scheduled, as text. Shown so it is not scheduled twice. */
  scheduledRateText?: string | null;
  /** ISO date billing is already scheduled to end on, if any. */
  billingEndsOn?: string | null;
  /** The dedicated page for multi-step or high-risk operations (hardware, transfer, vehicle sale). */
  servicePageHref: string;
  assignment?: { id: string; deviceId: string; deviceLabel: string; status: string } | null;
  /** Adds the Stripe quantity reminder to the resume form; the action's result message always includes it. */
  billedByStripe?: boolean;
};

type TabKey = "price" | "pause" | "end";

const moreLinkClass = "inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

function isoLabel(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : displayDate(date);
}

/**
 * Quick actions for ONE service: change its price, pause or resume it, or schedule its end.
 * One task is shown at a time, chosen from a tab bar, so the user never reads three forms to do one thing.
 * Anything multi-step or high-risk (hardware replacement, transfer, removal on vehicle sale)
 * lives on the service page or its own guided flow, so each operation has exactly one authoritative home.
 */
export function CustomerServiceManagementModal({
  subscriptionId,
  subscriptionItemId,
  serviceLabel,
  nextBillingDate,
  currentAmount,
  currency = "XCD",
  currentRateText,
  scheduledRateText = null,
  billingEndsOn = null,
  servicePageHref,
  assignment = null,
  billedByStripe = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("price");
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const titleId = `manage-service-title-${subscriptionItemId}`;
  const paused = assignment?.status === "suspended";
  const tabs: { key: TabKey; label: string }[] = [
    { key: "price", label: "Change price" },
    ...(assignment ? [{ key: "pause" as const, label: paused ? "Resume" : "Pause" }] : []),
    { key: "end", label: "End service" },
  ];
  const tabId = (key: TabKey) => `${titleId}-tab-${key}`;
  const panelId = (key: TabKey) => `${titleId}-panel-${key}`;

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) manageButtonRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const openDialog = () => {
    setTab("price");
    setOpen(true);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((entry) => entry.key === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].key);
    document.getElementById(tabId(tabs[next].key))?.focus();
  };

  const nextBillLabel = isoLabel(nextBillingDate);
  const endsLabel = isoLabel(billingEndsOn);

  return <>
    <button ref={manageButtonRef} type="button" onClick={openDialog} aria-haspopup="dialog" className="min-h-11 w-fit rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30 dark:focus-visible:ring-offset-zinc-900">Quick actions</button>
    {open ? <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 text-left shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-lg font-semibold tracking-tight">{serviceLabel}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              {currentRateText ? <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{currentRateText}</span> : null}
              {nextBillLabel ? <><span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span><span>Next bill {nextBillLabel}</span></> : null}
              {assignment ? <><span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span><span>{assignment.deviceLabel}{paused ? <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Paused</span> : null}</span></> : null}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} className="-mr-2 -mt-1 shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" aria-label={`Close quick actions for ${serviceLabel}`}>
            <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {scheduledRateText || endsLabel ? <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {scheduledRateText ? <li>Price change already scheduled: {scheduledRateText}</li> : null}
          {endsLabel ? <li>Billing is already scheduled to end on {endsLabel}</li> : null}
        </ul> : null}

        <div role="tablist" aria-label={`What do you want to do with ${serviceLabel}?`} className={`mt-4 grid gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tabs.map((entry) => {
            const selected = entry.key === tab;
            return <button key={entry.key} id={tabId(entry.key)} type="button" role="tab" aria-selected={selected} aria-controls={panelId(entry.key)} tabIndex={selected ? 0 : -1} onClick={() => setTab(entry.key)} onKeyDown={onTabKeyDown} className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${selected ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}>{entry.label}</button>;
          })}
        </div>

        <div id={panelId("price")} role="tabpanel" aria-labelledby={tabId("price")} hidden={tab !== "price"} className="mt-4">
          <ScheduleCanonicalDraftRateForm itemId={subscriptionItemId} subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} currentAmount={currentAmount} currency={currency} />
        </div>
        {assignment ? <div id={panelId("pause")} role="tabpanel" aria-labelledby={tabId("pause")} hidden={tab !== "pause"} className="mt-4">
          {paused
            ? <CanonicalServiceResumeForm variant="bare" subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignmentId={assignment.id} deviceLabel={assignment.deviceLabel} billedByStripe={billedByStripe} />
            : <CanonicalServicePauseForm variant="bare" subscriptionId={subscriptionId} subscriptionItemId={subscriptionItemId} assignmentId={assignment.id} />}
        </div> : null}
        <div id={panelId("end")} role="tabpanel" aria-labelledby={tabId("end")} hidden={tab !== "end"} className="mt-4">
          <ScheduleCanonicalDraftItemEndForm itemId={subscriptionItemId} subscriptionId={subscriptionId} />
        </div>

        <nav aria-label="More actions for this service" className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">More actions</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {assignment ? <li><Link href={`/admin/devices/${assignment.deviceId}/replace`} className={moreLinkClass}>Replace tracker</Link></li> : null}
            {assignment ? <li><Link href={`/admin/devices/${assignment.deviceId}/swap-sim`} className={moreLinkClass}>Swap SIM</Link></li> : null}
            <li><Link href={`${servicePageHref}#transfer-action-${subscriptionItemId}`} className={moreLinkClass}>Transfer</Link></li>
            {assignment ? <li><Link href={`${servicePageHref}#sold-action-${subscriptionItemId}`} className={moreLinkClass}>Vehicle sold</Link></li> : null}
            <li><Link href={servicePageHref} className={`${moreLinkClass} border-transparent text-emerald-700 hover:underline dark:text-emerald-400`}>Service page</Link></li>
          </ul>
        </nav>
      </div>
    </div> : null}
  </>;
}
