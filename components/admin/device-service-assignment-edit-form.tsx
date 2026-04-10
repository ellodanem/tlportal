"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateServiceAssignmentDates } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Saving…" : "Save dates"}
    </button>
  );
}

export function DeviceServiceAssignmentEditForm({
  deviceId,
  assignmentId,
  defaultStartDate,
  defaultNextDueDate,
}: {
  deviceId: string;
  assignmentId: string;
  defaultStartDate: string;
  defaultNextDueDate: string;
}) {
  const [state, formAction] = useActionState(updateServiceAssignmentDates, deviceFormInitialState);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />

      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="svc-startDate">
          Service start date
        </label>
        <input
          id="svc-startDate"
          name="startDate"
          type="date"
          key={defaultStartDate}
          defaultValue={defaultStartDate}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500">Optional. Clear the field to remove the start date.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="svc-nextDueDate">
          Next due
        </label>
        <input
          id="svc-nextDueDate"
          name="nextDueDate"
          type="date"
          key={defaultNextDueDate}
          defaultValue={defaultNextDueDate}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500">Optional. Clear to remove.</p>
      </div>

      <SubmitButton />
    </form>
  );
}
