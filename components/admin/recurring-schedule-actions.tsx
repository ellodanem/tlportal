"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  endRecurringScheduleAction,
  pauseRecurringScheduleAction,
  resumeRecurringScheduleAction,
  runRecurringScheduleNowAction,
  type RunScheduleNowState,
  type ScheduleStatusState,
} from "@/app/admin/recurring-invoices/actions";

function ActionButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function RecurringScheduleActions({
  scheduleId,
  status,
}: {
  scheduleId: string;
  status: string;
}) {
  const router = useRouter();
  const [runState, runAction] = useActionState(runRecurringScheduleNowAction, {} as RunScheduleNowState);
  const [statusState, pauseAction] = useActionState(pauseRecurringScheduleAction, {} as ScheduleStatusState);
  const [, resumeAction] = useActionState(resumeRecurringScheduleAction, {} as ScheduleStatusState);
  const [, endAction] = useActionState(endRecurringScheduleAction, {} as ScheduleStatusState);

  useEffect(() => {
    if (runState.ok || statusState.ok) router.refresh();
  }, [runState.ok, statusState.ok, router]);

  if (status === "ended") return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="font-medium">Schedule actions</p>
      <div className="flex flex-wrap gap-3">
        {status === "active" ? (
          <>
            <form action={runAction}>
              <input type="hidden" name="scheduleId" value={scheduleId} />
              <ActionButton label="Generate invoice now" pendingLabel="Generating…" />
            </form>
            <form action={pauseAction}>
              <input type="hidden" name="scheduleId" value={scheduleId} />
              <ActionButton label="Pause" pendingLabel="Pausing…" />
            </form>
          </>
        ) : null}
        {status === "paused" ? (
          <form action={resumeAction}>
            <input type="hidden" name="scheduleId" value={scheduleId} />
            <ActionButton label="Resume" pendingLabel="Resuming…" />
          </form>
        ) : null}
        <form action={endAction}>
          <input type="hidden" name="scheduleId" value={scheduleId} />
          <button type="submit" className="text-sm font-medium text-red-700 hover:underline dark:text-red-400">
            End schedule
          </button>
        </form>
      </div>
      {runState.error ? <p className="text-red-700">{runState.error}</p> : null}
      {runState.ok && runState.message ? <p className="text-emerald-800">{runState.message}</p> : null}
      {statusState.error ? <p className="text-red-700">{statusState.error}</p> : null}
      {statusState.ok && statusState.message ? <p className="text-emerald-800">{statusState.message}</p> : null}
    </div>
  );
}
