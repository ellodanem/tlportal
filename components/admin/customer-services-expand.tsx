"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { markAssignmentPeriodPaidAction } from "@/app/admin/customers/renewal-actions";
import type { RenewalActionState } from "@/app/admin/customers/renewal-action-state";
import type { CustomerTableDeviceRow } from "@/lib/admin/customer-table-rows";
import type { CustomerBillingMode } from "@prisma/client";

const renewalInitial: RenewalActionState = { error: null };

function formatDue(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function urgencyLabel(urgency: CustomerTableDeviceRow["urgency"]) {
  if (urgency === "overdue") return "Overdue";
  if (urgency === "due_soon") return "Due soon";
  return null;
}

function coverageLabel(deviceCount: number, dueDeviceCount: number): string {
  if (deviceCount <= 0) return "No devices";
  const countLabel = deviceCount === 1 ? "1 device" : `${deviceCount} devices`;
  if (dueDeviceCount <= 0) return countLabel;
  if (deviceCount === 1) return "1 device · due";
  return `${countLabel} · ${dueDeviceCount} due`;
}

export function CustomerServicesExpand({
  customerId,
  billingMode,
  devices,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  devices: CustomerTableDeviceRow[];
}) {
  const [open, setOpen] = useState(false);
  const [, markAction, markPending] = useActionState(markAssignmentPeriodPaidAction, renewalInitial);

  const deviceCount = devices.length;
  const dueDeviceCount = devices.filter((d) => d.urgency === "overdue" || d.urgency === "due_soon").length;
  const canMarkPaid = billingMode === "manual_legacy";

  if (deviceCount === 0) {
    return <span className="text-zinc-400">—</span>;
  }

  const label = coverageLabel(deviceCount, dueDeviceCount);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-left text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
      >
        {label}
        <span className="ml-1 text-zinc-400">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="mt-2 max-w-sm space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          {devices.map((d) => {
            const ul = urgencyLabel(d.urgency);
            return (
              <li key={d.assignmentId} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p
                    className="font-medium text-zinc-900 dark:text-zinc-50"
                    title={d.imei !== d.deviceLabel ? `IMEI ${d.imei}` : undefined}
                  >
                    {d.deviceLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    Due {formatDue(d.nextDueDate)}
                    {ul ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                        {ul}
                      </span>
                    ) : null}
                  </p>
                </div>
                {canMarkPaid && (d.urgency === "overdue" || d.urgency === "due_soon") ? (
                  <form action={markAction} className="shrink-0">
                    <input type="hidden" name="assignmentId" value={d.assignmentId} />
                    <input type="hidden" name="customerId" value={customerId} />
                    <input type="hidden" name="deviceId" value={d.deviceId} />
                    <button
                      type="submit"
                      disabled={markPending}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
                    >
                      {markPending ? "Saving…" : "Mark paid"}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
          {canMarkPaid ? (
            <li className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
              <Link
                href={`/admin/customers/${customerId}/billing`}
                className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Full renewal options →
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
