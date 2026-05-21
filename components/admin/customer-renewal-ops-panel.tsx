"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  markAllCustomerAssignmentsPaidAction,
  markAssignmentPeriodPaidAction,
  renewalActionInitialState,
} from "@/app/admin/customers/renewal-actions";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { displayAssignmentOpsStatus } from "@/lib/admin/assignment-ops-urgency";
import { formatAssignmentDateLabel } from "@/lib/domain/assignment-renewal";
import { formatPlanTerm } from "@/lib/subscription-options/display";
import type { CustomerBillingMode, DeviceObjectType, ServiceAssignmentStatus } from "@prisma/client";

type RenewalRow = {
  id: string;
  intervalMonths: number | null;
  nextDueDate: string | null;
  lastPaymentStatus: string | null;
  lastInvoiceId: string | null;
  status: ServiceAssignmentStatus;
  device: {
    id: string;
    imei: string;
    label: string | null;
    objectType: DeviceObjectType | null;
  };
};

function statusPill(status: ServiceAssignmentStatus | "due_soon" | "overdue") {
  const classes: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    due_soon: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    overdue: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
    suspended: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${classes[status] ?? classes.active}`}
    >
      {label}
    </span>
  );
}

function MarkPaidSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function MarkOneForm({ row, customerId }: { row: RenewalRow; customerId: string }) {
  const [oneState, oneAction] = useActionState(markAssignmentPeriodPaidAction, renewalActionInitialState);

  const nextDue = row.nextDueDate ? new Date(row.nextDueDate) : null;
  const displayStatus = displayAssignmentOpsStatus(row.status, nextDue);
  const deviceLabel = row.device.label?.trim() || row.device.imei;

  return (
    <li className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <form
        action={oneAction}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
        onSubmit={(e) => {
          if (
            !window.confirm(
              `Mark the current period paid for ${deviceLabel} and advance next due by ${row.intervalMonths != null ? formatPlanTerm(row.intervalMonths) : "the billing term"}?`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="assignmentId" value={row.id} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="deviceId" value={row.device.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/devices/${row.device.id}/edit#active-service`}
              className="inline-flex items-center gap-1.5 font-medium text-emerald-800 hover:underline dark:text-emerald-300"
            >
              <ObjectTypeIcon type={row.device.objectType} className="h-4 w-4 text-zinc-500" />
              {deviceLabel}
            </Link>
            {statusPill(displayStatus)}
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Term: {row.intervalMonths != null ? formatPlanTerm(row.intervalMonths) : "not set"}
            {" · "}
            Next due: {formatAssignmentDateLabel(nextDue)}
            {row.lastPaymentStatus ? (
              <>
                {" · "}
                Last: {row.lastPaymentStatus}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">Invoice ref (optional)</span>
            <input
              name="invoiceRef"
              type="text"
              placeholder="Invoiless or receipt #"
              className="mt-0.5 block w-full min-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <MarkPaidSubmit label="Mark period paid" />
        </div>
      </form>
      {oneState.error ? <p className="mt-2 text-sm text-red-600">{oneState.error}</p> : null}
      {oneState.message ? (
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{oneState.message}</p>
      ) : null}
    </li>
  );
}

export function CustomerRenewalOpsPanel({
  customerId,
  billingMode,
  rows,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  rows: RenewalRow[];
}) {
  const [bulkState, bulkAction] = useActionState(
    markAllCustomerAssignmentsPaidAction,
    renewalActionInitialState,
  );

  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Renewal ops</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          No active device assignments. Assign devices from the customer overview or Devices admin.
        </p>
      </section>
    );
  }

  const missingTerm = rows.some((r) => r.intervalMonths == null);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Renewal ops</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {billingMode === "manual_legacy" ? (
          <>
            Cash / manual billing: when you receive payment (cash, transfer, or Invoiless invoice marked paid),
            <strong> mark period paid</strong> to roll <strong>next due</strong> forward per device.
          </>
        ) : (
          <>
            Card subscriptions renew via Stripe; <strong>invoice.paid</strong> can auto-advance next due on all active
            devices (disable with <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">STRIPE_RENEWAL_AUTO_ADVANCE=false</code>
            ). Use manual mark paid for cash top-ups or corrections.
          </>
        )}
      </p>

      {missingTerm ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          One or more assignments have no billing term — set 1 / 3 / 6 / 12 months on{" "}
          <strong>Manage device</strong> before marking paid.
        </p>
      ) : null}

      {rows.length > 1 ? (
        <form
          action={bulkAction}
          className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            if (
              !window.confirm(
                `Mark the current period paid for all ${rows.length} active devices and advance each next due date?`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="customerId" value={customerId} />
          <label className="block flex-1 text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">
              Invoice ref for all devices (optional)
            </span>
            <input
              name="invoiceRef"
              type="text"
              placeholder="e.g. Invoiless invoice id"
              className="mt-0.5 block w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <MarkPaidSubmit label={`Mark all ${rows.length} paid`} />
          {bulkState.error ? <p className="w-full text-sm text-red-600 sm:order-last">{bulkState.error}</p> : null}
          {bulkState.message ? (
            <p className="w-full text-sm text-emerald-800 dark:text-emerald-200 sm:order-last">{bulkState.message}</p>
          ) : null}
        </form>
      ) : null}

      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <MarkOneForm key={row.id} row={row} customerId={customerId} />
        ))}
      </ul>
    </section>
  );
}
