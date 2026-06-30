"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  pauseServiceAssignmentAction,
  resumeServiceAssignmentAction,
} from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { useDeviceFormRefreshOnSuccess } from "@/components/admin/use-device-form-refresh-on-success";
import {
  SERVICE_PAUSE_DISPOSITION_LABEL,
  SERVICE_PAUSE_REASON_LABEL,
  SERVICE_PAUSE_REASONS,
} from "@/lib/domain/service-pause";
import type { CustomerBillingMode, ServiceAssignmentPauseReason } from "@prisma/client";

const fieldClass =
  "rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

function PauseSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      {pending ? "Pausing…" : "Pause"}
    </button>
  );
}

function ResumeSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Resuming…" : "Resume"}
    </button>
  );
}

export function AssignmentPauseForm({
  assignmentId,
  deviceId,
  billingMode,
  compact = false,
}: {
  assignmentId: string;
  deviceId: string;
  billingMode: CustomerBillingMode;
  compact?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(pauseServiceAssignmentAction, deviceFormInitialState);
  useDeviceFormRefreshOnSuccess(state, isPending);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        if (!window.confirm("Pause service for this device?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="deviceId" value={deviceId} />
      {compact ? <input type="hidden" name="deviceDisposition" value="returned" /> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Pause reason</span>
          <select name="pauseReason" defaultValue="accident" className={`mt-0.5 block ${fieldClass}`}>
            {SERVICE_PAUSE_REASONS.map((r) => (
              <option key={r} value={r}>
                {compact ? r.replace(/_/g, " ") : SERVICE_PAUSE_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        {!compact ? (
          <label className="block text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">Hardware</span>
            <select name="deviceDisposition" defaultValue="returned" className={`mt-0.5 block ${fieldClass}`}>
              {Object.entries(SERVICE_PAUSE_DISPOSITION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <PauseSubmit />
      </div>
      {billingMode === "stripe_subscription" && !compact ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Also pause Stripe or set vehicle quantity to 0 until reinstall.
        </p>
      ) : null}
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.message ? <p className="text-xs text-emerald-800 dark:text-emerald-200">{state.message}</p> : null}
    </form>
  );
}

export function AssignmentResumeForm({
  assignmentId,
  deviceId,
  billingMode,
}: {
  assignmentId: string;
  deviceId: string;
  billingMode: CustomerBillingMode;
}) {
  const [state, formAction, isPending] = useActionState(resumeServiceAssignmentAction, deviceFormInitialState);
  useDeviceFormRefreshOnSuccess(state, isPending);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        if (!window.confirm("Resume service for this device?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="deviceId" value={deviceId} />
      <div className="flex flex-wrap items-center gap-2">
        <ResumeSubmit />
        {billingMode === "stripe_subscription" ? (
          <span className="text-xs text-amber-800 dark:text-amber-200">Restore Stripe billing after install.</span>
        ) : null}
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.message ? <p className="text-xs text-emerald-800 dark:text-emerald-200">{state.message}</p> : null}
    </form>
  );
}

export function pauseReasonLabel(reason: ServiceAssignmentPauseReason | null | undefined): string | null {
  if (!reason) return null;
  return SERVICE_PAUSE_REASON_LABEL[reason];
}
