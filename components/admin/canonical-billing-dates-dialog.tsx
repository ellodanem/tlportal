"use client";

import { useState } from "react";

import { CanonicalBillingDatesForm } from "@/components/admin/canonical-billing-dates-form";
import { ServiceActionDialog } from "@/components/admin/canonical-subscription/service-action-dialog";

/**
 * A small "Wrong date?" link that sits next to the renewal date and opens the correction form in a
 * dialog. Correcting dates is a rare fix, so it stays out of the page flow until it is needed.
 */
export function CanonicalBillingDatesDialog({
  subscriptionId,
  startDate,
  renewalDate,
  intervalMonths,
}: {
  subscriptionId: string;
  startDate: string;
  renewalDate: string;
  intervalMonths: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded px-1 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:min-h-0 dark:text-emerald-400"
      >
        Wrong date?
      </button>
      {open ? (
        <ServiceActionDialog
          title="Correct billing dates"
          description="Use this instead of recreating the subscription. Services, rates, the recurring schedule and installed devices move to the new dates together. It is refused once an invoice, provider link or billing operation exists for the current dates."
          onClose={() => setOpen(false)}
        >
          <CanonicalBillingDatesForm bare subscriptionId={subscriptionId} startDate={startDate} renewalDate={renewalDate} intervalMonths={intervalMonths} />
        </ServiceActionDialog>
      ) : null}
    </>
  );
}
