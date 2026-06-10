"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { renewalActionInitialState } from "@/app/admin/customers/renewal-action-state";
import { markAssignmentPeriodPaidAction } from "@/app/admin/customers/renewal-actions";
import { MarkPaidOptionalNextDueField } from "@/components/admin/mark-paid-optional-next-due-field";
import { formatAssignmentDateLabel } from "@/lib/domain/assignment-renewal";
import { formatPlanTerm } from "@/lib/subscription-options/display";

function coerceAssignmentDate(d: Date | string | null): Date | null {
  if (d == null) {
    return null;
  }
  if (d instanceof Date) {
    return d;
  }
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
    >
      {pending ? "Updating…" : "Mark period paid"}
    </button>
  );
}

export function MarkAssignmentPaidForm({
  assignmentId,
  customerId,
  deviceId,
  intervalMonths,
  nextDueDate,
}: {
  assignmentId: string;
  customerId: string;
  deviceId: string;
  intervalMonths: number | null;
  /** Serialized from server as ISO string when set. */
  nextDueDate: Date | string | null;
}) {
  const [state, action] = useActionState(markAssignmentPeriodPaidAction, renewalActionInitialState);
  const nextDue = coerceAssignmentDate(nextDueDate);

  if (intervalMonths == null) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-200">
        Set a billing term above before using mark paid.
      </p>
    );
  }

  return (
    <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Mark period paid</h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Advances next due by {formatPlanTerm(intervalMonths)} from{" "}
        {nextDue ? formatAssignmentDateLabel(nextDue) : "today (first period)"}, or set a custom next-due
        date below for late payments.
      </p>
      <form
        action={action}
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const customDue = (form.elements.namedItem("nextDueOverride") as HTMLInputElement | null)?.value?.trim();
          const confirmMsg = customDue
            ? `Mark this period paid and set next due to ${customDue}?`
            : "Mark this period paid and advance next due by the billing term?";
          if (!window.confirm(confirmMsg)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="deviceId" value={deviceId} />
        <MarkPaidOptionalNextDueField
          intervalMonths={intervalMonths}
          nextDueDate={nextDue}
          labelClassName="text-zinc-600 dark:text-zinc-400"
          inputClassName="mt-1 block w-full max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <label className="block flex-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Invoice ref (optional)</span>
          <input
            name="invoiceRef"
            type="text"
            className="mt-1 w-full max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="Invoiless id or receipt"
          />
        </label>
        <Submit />
      </form>
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
      {state.message ? <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{state.message}</p> : null}
    </div>
  );
}
