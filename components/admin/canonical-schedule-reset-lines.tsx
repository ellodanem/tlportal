"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  resetCanonicalScheduleLinesAction,
  type ScheduleStatusState,
} from "@/app/admin/recurring-invoices/actions";

export function CanonicalScheduleResetLines({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resetCanonicalScheduleLinesAction, {} as ScheduleStatusState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-60 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-100"
      >
        {pending ? "Resetting…" : "Reset to one line per vehicle"}
      </button>
      {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
    </form>
  );
}
