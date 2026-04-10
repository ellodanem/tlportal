"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { unassignDeviceFromCustomer } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-200 dark:hover:bg-red-950/40"
    >
      {pending ? "Unassigning…" : "Unassign from customer"}
    </button>
  );
}

export function DeviceUnassignForm({ deviceId }: { deviceId: string }) {
  const [state, formAction] = useActionState(unassignDeviceFromCustomer, deviceFormInitialState);

  return (
    <form action={formAction} className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <input type="hidden" name="deviceId" value={deviceId} />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Remove from customer
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Ends the active service, sets the device to <strong className="font-medium text-zinc-800 dark:text-zinc-200">in stock</strong>, and
        keeps history on the customer. Use when hardware is removed or moved before re-assigning elsewhere.
      </p>
      {state.error ? (
        <p
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <SubmitButton />
      </div>
    </form>
  );
}
