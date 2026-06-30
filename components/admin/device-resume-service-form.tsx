"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resumeServiceAssignmentAction } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { useDeviceFormRefreshOnSuccess } from "@/components/admin/use-device-form-refresh-on-success";
import type { CustomerBillingMode } from "@prisma/client";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Resuming…" : "Resume service"}
    </button>
  );
}

export function DeviceResumeServiceForm({
  deviceId,
  assignmentId,
  billingMode,
}: {
  deviceId: string;
  assignmentId: string;
  billingMode: CustomerBillingMode;
}) {
  const [state, formAction, isPending] = useActionState(resumeServiceAssignmentAction, deviceFormInitialState);
  useDeviceFormRefreshOnSuccess(state, isPending);

  return (
    <form
      action={formAction}
      className="mt-4"
      onSubmit={(e) => {
        if (!window.confirm("Resume service for this customer? Device status returns to assigned and billing reminders restart.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />

      {billingMode === "stripe_subscription" ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Card billing: after resume, restore Stripe billing or vehicle quantity when the tracker is installed again.
        </p>
      ) : null}

      {state.error ? (
        <p
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p
          className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
