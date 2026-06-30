"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { pauseServiceAssignmentAction } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { useDeviceFormRefreshOnSuccess } from "@/components/admin/use-device-form-refresh-on-success";
import {
  SERVICE_PAUSE_DISPOSITION_LABEL,
  SERVICE_PAUSE_REASON_LABEL,
  SERVICE_PAUSE_REASONS,
} from "@/lib/domain/service-pause";
import type { CustomerBillingMode } from "@prisma/client";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
    >
      {pending ? "Pausing…" : "Pause service"}
    </button>
  );
}

export function DevicePauseServiceForm({
  deviceId,
  assignmentId,
  billingMode,
}: {
  deviceId: string;
  assignmentId: string;
  billingMode: CustomerBillingMode;
}) {
  const [state, formAction, isPending] = useActionState(pauseServiceAssignmentAction, deviceFormInitialState);
  useDeviceFormRefreshOnSuccess(state, isPending);

  return (
    <form
      action={formAction}
      className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800"
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Pause service for this customer? Billing reminders stop and hardware is marked returned or in stock. The customer link is kept for easy resume.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />

      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Pause service
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Use when there is no vehicle to track (accident, seasonal, etc.) but the customer may return. Stops renewal
        reminders and freezes the next-due date until resume.
      </p>

      {billingMode === "stripe_subscription" ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Card billing: after pausing here, also pause Stripe or set vehicle quantity to 0 until reinstall (Phase 2
          will automate this).
        </p>
      ) : null}

      {state.error ? (
        <p
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p
          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-4 grid max-w-md gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="pause-reason">
            Reason
          </label>
          <select id="pause-reason" name="pauseReason" required defaultValue="accident" className={inputClass}>
            {SERVICE_PAUSE_REASONS.map((r) => (
              <option key={r} value={r}>
                {SERVICE_PAUSE_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="pause-disposition">
            Hardware
          </label>
          <select
            id="pause-disposition"
            name="deviceDisposition"
            required
            defaultValue="returned"
            className={inputClass}
          >
            {Object.entries(SERVICE_PAUSE_DISPOSITION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="pause-note">
            Note (optional)
          </label>
          <textarea
            id="pause-note"
            name="pauseNote"
            rows={2}
            placeholder="e.g. Total loss — tracker in office"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4">
        <SubmitButton />
      </div>
    </form>
  );
}
