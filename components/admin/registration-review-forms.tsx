"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from "@/app/admin/registration-requests/actions";
import { registrationReviewInitialState } from "@/app/admin/registration-requests/registration-review-state";

export function RegistrationReviewForms({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [approveState, approveAction, approvePending] = useActionState(
    approveRegistrationRequest,
    registrationReviewInitialState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectRegistrationRequest,
    registrationReviewInitialState,
  );

  useEffect(() => {
    if (approveState.next) {
      router.push(approveState.next);
    }
  }, [approveState.next, router]);

  useEffect(() => {
    if (rejectState.next) {
      router.push(rejectState.next);
    }
  }, [rejectState.next, router]);

  return (
    <div className="space-y-6">
      {approveState.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {approveState.error}
        </p>
      ) : null}
      {rejectState.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {rejectState.error}
        </p>
      ) : null}

      <form action={approveAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={registrationId} />
        <button
          type="submit"
          disabled={approvePending || rejectPending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {approvePending ? "Approving…" : "Approve — create customer"}
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Creates a customer with notes + tag <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">from-registration</code>. Invoiless is separate.
        </p>
      </form>

      <form action={rejectAction} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
        <input type="hidden" name="id" value={registrationId} />
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="reject-reason">
          Rejection reason (required)
        </label>
        <textarea
          id="reject-reason"
          name="rejectionReason"
          required
          rows={3}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          placeholder="Reason recorded on this request for audit."
        />
        <button
          type="submit"
          disabled={approvePending || rejectPending}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {rejectPending ? "Rejecting…" : "Reject request"}
        </button>
      </form>
    </div>
  );
}
