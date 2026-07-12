"use client";

import {
  CustomerRenewalOpsContent,
  type CustomerRenewalOpsRow,
} from "@/components/admin/customer-renewal-ops-panel";
import { countRenewalOps, renewalOpsSummaryLabel } from "@/lib/admin/renewal-ops-display";
import type { CustomerBillingMode } from "@prisma/client";

/**
 * Hard-dismiss modal: only Back closes it (no backdrop click).
 * Per-device next due, billing term, mark paid.
 */
export function DeviceRenewalsModal({
  open,
  onClose,
  customerId,
  billingMode,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  billingMode: CustomerBillingMode;
  rows: CustomerRenewalOpsRow[];
}) {
  if (!open) return null;

  const summary = rows.length > 0 ? renewalOpsSummaryLabel(countRenewalOps(rows)) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-renewals-title"
    >
      <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col rounded-t-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:max-h-[90vh] sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← Back to billing
          </button>
          <div className="min-w-0 text-center">
            <h2 id="device-renewals-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Device renewals
            </h2>
            {summary ? (
              <p className="truncate text-[11px] font-normal text-zinc-500 dark:text-zinc-400">{summary}</p>
            ) : null}
          </div>
          <span className="w-16 shrink-0" aria-hidden />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <CustomerRenewalOpsContent
            customerId={customerId}
            billingMode={billingMode}
            rows={rows}
            alwaysExpandDevices
          />
        </div>

        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Back to billing
          </button>
        </div>
      </div>
    </div>
  );
}
