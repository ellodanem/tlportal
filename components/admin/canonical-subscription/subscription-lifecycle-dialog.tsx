"use client";

import { useEffect, useRef, useState } from "react";

import { CanonicalSubscriptionLifecycleForm } from "@/components/admin/canonical-subscription-operations-form";
import { SUBSCRIPTION_LIFECYCLE_ACTIONS } from "@/lib/domain/canonical-subscription-navigation";

/**
 * Infrequent lifecycle changes (pause, resume, end, cancel) live behind one confirm dialog.
 * The dialog hosts the existing guarded form, which requires an outcome and a staff reason.
 */
export function SubscriptionLifecycleDialog({ subscriptionId, lifecycleStatus }: { subscriptionId: string; lifecycleStatus: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const titleId = `lifecycle-title-${subscriptionId}`;

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!SUBSCRIPTION_LIFECYCLE_ACTIONS[lifecycleStatus]?.length) return null;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
        Pause, end or cancel
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold tracking-tight">Change agreement status</h2>
                <p className="mt-1 text-sm text-zinc-500">This affects the whole subscription and all of its services. To pause or end a single service, use Services.</p>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close status dialog" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
                <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <CanonicalSubscriptionLifecycleForm subscriptionId={subscriptionId} lifecycleStatus={lifecycleStatus} />
          </div>
        </div>
      ) : null}
    </>
  );
}
