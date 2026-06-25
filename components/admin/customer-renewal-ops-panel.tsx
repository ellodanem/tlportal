"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { renewalActionInitialState } from "@/app/admin/customers/renewal-action-state";
import {
  markAllCustomerAssignmentsPaidAction,
  markAssignmentPeriodPaidAction,
  updateAllCustomerAssignmentsNextDueAction,
  updateAssignmentNextDueAction,
} from "@/app/admin/customers/renewal-actions";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { displayAssignmentOpsStatus } from "@/lib/admin/assignment-ops-urgency";
import {
  countRenewalOps,
  priorityRenewalRows,
  renewalOpsSummaryLabel,
  sortRenewalRowsByUrgency,
} from "@/lib/admin/renewal-ops-display";
import { MarkPaidOptionalNextDueField } from "@/components/admin/mark-paid-optional-next-due-field";
import { dateInputValueFromDate } from "@/lib/domain/assignment-renewal";
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

function NextDueSaveSubmit({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function NextDueEditForm({ row, customerId }: { row: RenewalRow; customerId: string }) {
  const [dueState, dueAction] = useActionState(updateAssignmentNextDueAction, renewalActionInitialState);
  const nextDue = row.nextDueDate ? new Date(row.nextDueDate) : null;

  return (
    <form action={dueAction} className="flex flex-col gap-1">
      <input type="hidden" name="assignmentId" value={row.id} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="deviceId" value={row.device.id} />
      <label className="block text-xs">
        <span className="font-medium text-zinc-600 dark:text-zinc-400">Next due</span>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <input
            name="nextDueDate"
            type="date"
            key={dateInputValueFromDate(nextDue)}
            defaultValue={dateInputValueFromDate(nextDue)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <NextDueSaveSubmit />
        </div>
      </label>
      {dueState.error ? <p className="text-sm text-red-600">{dueState.error}</p> : null}
      {dueState.message ? (
        <p className="text-sm text-emerald-800 dark:text-emerald-200">{dueState.message}</p>
      ) : null}
    </form>
  );
}

function MarkOneForm({ row, customerId }: { row: RenewalRow; customerId: string }) {
  const [oneState, oneAction] = useActionState(markAssignmentPeriodPaidAction, renewalActionInitialState);

  const nextDue = row.nextDueDate ? new Date(row.nextDueDate) : null;
  const displayStatus = displayAssignmentOpsStatus(row.status, nextDue);
  const deviceLabel = row.device.label?.trim() || row.device.imei;

  return (
    <li className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
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
            {row.lastPaymentStatus ? (
              <>
                {" · "}
                Last: {row.lastPaymentStatus}
              </>
            ) : null}
          </p>
        </div>
        <NextDueEditForm row={row} customerId={customerId} />
      </div>
      <form
        action={oneAction}
        className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const customDue = (form.elements.namedItem("nextDueOverride") as HTMLInputElement | null)?.value?.trim();
          const confirmMsg = customDue
            ? `Mark the current period paid for ${deviceLabel} and set next due to ${customDue}?`
            : `Mark the current period paid for ${deviceLabel} and advance next due by ${row.intervalMonths != null ? formatPlanTerm(row.intervalMonths) : "the billing term"}?`;
          if (!window.confirm(confirmMsg)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="assignmentId" value={row.id} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="deviceId" value={row.device.id} />
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-end">
          {row.intervalMonths != null ? (
            <MarkPaidOptionalNextDueField intervalMonths={row.intervalMonths} nextDueDate={nextDue} />
          ) : null}
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

function RenewalOpsBody({
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
  const [bulkDueState, bulkDueAction] = useActionState(
    updateAllCustomerAssignmentsNextDueAction,
    renewalActionInitialState,
  );

  const missingTerm = rows.some((r) => r.intervalMonths == null);
  const isManual = billingMode === "manual_legacy";
  const counts = countRenewalOps(rows);
  const priority = priorityRenewalRows(rows);
  const sorted = sortRenewalRowsByUrgency(rows);
  const showPriority = priority.length > 0;
  const allDevicesDefaultOpen = priority.length === 0 || sorted.length <= priority.length;

  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {isManual ? (
          <>
            When payment is received (cash, transfer, or Invoiless paid), <strong>mark period paid</strong> to advance{" "}
            <strong>next due</strong> per device — or pick a custom next-due date for late payments. You can also set or
            change <strong>next due</strong> directly on each device without marking paid. When every device shares the
            same renewal date, use <strong>apply to all</strong> below.
          </>
        ) : (
          <>
            Stripe <strong>invoice.paid</strong> can auto-advance next due on all active devices. Mark paid manually for
            cash or corrections, or set next due for all devices at once below.
          </>
        )}
      </p>

      {missingTerm ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          One or more assignments have no billing term — set 1 / 3 / 6 / 12 months on{" "}
          <strong>Manage device</strong> before marking paid.
        </p>
      ) : null}

      {showPriority ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Needs attention
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {priority.map((row) => (
              <MarkOneForm key={row.id} row={row} customerId={customerId} />
            ))}
          </ul>
        </div>
      ) : null}

      <details className="mt-4" open={allDevicesDefaultOpen}>
        <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200">
          All devices ({rows.length})
        </summary>

        {rows.length > 1 ? (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <form
              action={bulkDueAction}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                const form = e.currentTarget;
                const nextDue = (form.elements.namedItem("nextDueDate") as HTMLInputElement | null)?.value?.trim();
                const confirmMsg = nextDue
                  ? `Set next due to ${nextDue} for all ${rows.length} active devices?`
                  : `Clear next due on all ${rows.length} active devices?`;
                if (!window.confirm(confirmMsg)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="customerId" value={customerId} />
              <label className="block flex-1 text-xs">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Next due for all devices</span>
                <input
                  name="nextDueDate"
                  type="date"
                  className="mt-0.5 block w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <NextDueSaveSubmit label={`Apply to all ${rows.length}`} />
              {bulkDueState.error ? <p className="w-full text-sm text-red-600 sm:order-last">{bulkDueState.error}</p> : null}
              {bulkDueState.message ? (
                <p className="w-full text-sm text-emerald-800 dark:text-emerald-200 sm:order-last">{bulkDueState.message}</p>
              ) : null}
            </form>

            <form
              action={bulkAction}
              className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:flex-row sm:items-end"
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
          </div>
        ) : null}

        <ul className="mt-3 flex flex-col gap-3">
          {sorted.map((row) => {
            const inPriority = showPriority && priority.some((p) => p.id === row.id);
            if (inPriority) {
              return null;
            }
            return <MarkOneForm key={row.id} row={row} customerId={customerId} />;
          })}
        </ul>
      </details>
    </>
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
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Device renewals</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          No active device assignments. Assign devices from the customer overview or Devices admin.
        </p>
      </section>
    );
  }

  const counts = countRenewalOps(rows);
  const summary = renewalOpsSummaryLabel(counts);
  const isManual = billingMode === "manual_legacy";
  const hasUrgent = counts.overdue > 0 || counts.dueSoon > 0;
  const collapseForStripe = !isManual && !hasUrgent;

  const inner = <RenewalOpsBody customerId={customerId} billingMode={billingMode} rows={rows} />;

  if (collapseForStripe) {
    return (
      <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-zinc-900 marker:content-none dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">Device renewals</span>
          <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {summary} · renewals via Stripe when configured
          </span>
        </summary>
        <div className="border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800">{inner}</div>
      </details>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Device renewals</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{summary}</p>
      <div className="mt-3">{inner}</div>
    </section>
  );
}
