"use client";

import { useActionState } from "react";

import {
  feedbackAdminActionInitial,
  saveFeedbackAdminNote,
  updateFeedbackStatus,
  type FeedbackAdminActionState,
} from "@/app/admin/feedback/actions";
import { FEEDBACK_ADMIN_NOTE_MAX } from "@/lib/feedback/parse-contact";

type Props = {
  id: string;
  sharePermission: boolean;
  adminNote: string;
};

export function FeedbackReviewForms({ id, sharePermission, adminNote }: Props) {
  const [statusState, statusAction, statusPending] = useActionState<FeedbackAdminActionState, FormData>(
    updateFeedbackStatus,
    feedbackAdminActionInitial,
  );
  const [noteState, noteAction, notePending] = useActionState<FeedbackAdminActionState, FormData>(
    saveFeedbackAdminNote,
    feedbackAdminActionInitial,
  );

  return (
    <div className="space-y-6">
      {statusState.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" role="alert">
          {statusState.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={statusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="reviewed" />
          <button
            type="submit"
            disabled={statusPending}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Reviewed
          </button>
        </form>
        <form action={statusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="featured" />
          <button
            type="submit"
            disabled={statusPending || !sharePermission}
            title={!sharePermission ? "Private — not cleared to share" : undefined}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Featured
          </button>
        </form>
        <form action={statusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="archived" />
          <button
            type="submit"
            disabled={statusPending}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Archive
          </button>
        </form>
      </div>

      <form action={noteAction} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="feedback-admin-note" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Private staff note
        </label>
        <textarea
          id="feedback-admin-note"
          name="adminNote"
          rows={4}
          maxLength={FEEDBACK_ADMIN_NOTE_MAX}
          defaultValue={adminNote}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />
        {noteState.error ? (
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {noteState.error}
          </p>
        ) : noteState.ok ? (
          <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
            Note saved.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={notePending}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {notePending ? "Saving…" : "Save note"}
        </button>
      </form>
    </div>
  );
}
