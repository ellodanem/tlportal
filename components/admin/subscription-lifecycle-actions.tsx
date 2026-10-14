"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { openSubscriptionBillingPortalAction, setManualSubscriptionStatusAction } from "@/app/admin/subscriptions/actions";

export function SubscriptionLifecycleActions({
  customerId,
  scheduleId,
  scheduleStatus,
  hasStripeSubscription,
}: {
  customerId: string;
  scheduleId: string | null;
  scheduleStatus: "active" | "paused" | "ended" | null;
  hasStripeSubscription: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openPortal() {
    setError(null);
    startTransition(async () => {
      const result = await openSubscriptionBillingPortalAction(customerId);
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setError(result.error ?? "Could not open the billing portal.");
    });
  }

  return <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
    {scheduleId ? <div className="flex flex-wrap items-center gap-2"><form action={setManualSubscriptionStatusAction} className="flex flex-wrap gap-2"><input type="hidden" name="scheduleId" value={scheduleId} />{scheduleStatus !== "active" && scheduleStatus !== "ended" ? <button name="status" value="active" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Resume invoices</button> : null}{scheduleStatus === "active" ? <button name="status" value="paused" className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">Pause invoices</button> : null}{scheduleStatus !== "ended" ? <button name="status" value="ended" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:text-red-300">End subscription</button> : null}</form><Link href={`/admin/recurring-invoices/${scheduleId}`} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open recurring schedule</Link></div> : null}
    {hasStripeSubscription ? <button type="button" onClick={openPortal} disabled={pending} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30">{pending ? "Opening…" : "Open Stripe billing portal"}</button> : null}
    {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
  </div>;
}
