"use client";

import { useActionState, useState } from "react";

import { submitFeedback } from "@/app/feedback/actions";
import {
  feedbackFormInitialState,
  type FeedbackFormState,
} from "@/app/feedback/feedback-form-state";
import { FEEDBACK_BODY_MAX, FEEDBACK_CONTACT_MAX, FEEDBACK_NAME_MAX } from "@/lib/feedback/parse-contact";

function fieldClass() {
  return "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
}

function labelClass() {
  return "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
}

export function FeedbackForm() {
  const [state, formAction, pending] = useActionState<FeedbackFormState, FormData>(
    submitFeedback,
    feedbackFormInitialState,
  );
  const [sharePermission, setSharePermission] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [ratingMissing, setRatingMissing] = useState(false);

  if (state.ok === true) {
    return (
      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
        role="status"
      >
        {state.message}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-5"
      onSubmit={(e) => {
        if (rating == null) {
          e.preventDefault();
          setRatingMissing(true);
        }
      }}
    >
      {state.ok === false ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="feedback-website">Website</label>
        <input id="feedback-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label className={labelClass()} htmlFor="feedback-body">
          Your message <span className="text-red-600">*</span>
        </label>
        <textarea
          id="feedback-body"
          name="body"
          required
          rows={5}
          maxLength={FEEDBACK_BODY_MAX}
          placeholder="How has Track Lucia been for you?"
          className={`${fieldClass()} min-h-[120px]`}
        />
      </div>

      <fieldset>
        <legend className={labelClass()}>
          Rating <span className="text-red-600">*</span>
        </legend>
        <input type="hidden" name="rating" value={rating ?? ""} />
        <div
          className="mt-2 flex flex-wrap items-end gap-0.5"
          onMouseLeave={() => setHoverRating(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filledTo = hoverRating ?? rating ?? 0;
            const filled = n <= filledTo;
            const selected = rating === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setRating(n);
                  setHoverRating(null);
                  setRatingMissing(false);
                }}
                onMouseEnter={() => setHoverRating(n)}
                className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md px-1 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-pressed={selected}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
              >
                <span
                  className={`text-2xl leading-none ${filled ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
                  aria-hidden
                >
                  {filled ? "★" : "☆"}
                </span>
                <span className="mt-0.5 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        {ratingMissing ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
            Please choose a rating from 1 to 5.
          </p>
        ) : null}
      </fieldset>

      <div>
        <label className={labelClass()} htmlFor="feedback-name">
          Your name {sharePermission ? <span className="text-red-600">*</span> : null}
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {sharePermission ? "Required because you allowed sharing." : "Optional unless you allow sharing"}
        </p>
        <input
          id="feedback-name"
          name="displayName"
          type="text"
          maxLength={FEEDBACK_NAME_MAX}
          required={sharePermission}
          autoComplete="name"
          className={fieldClass()}
        />
      </div>

      <div>
        <label className={labelClass()} htmlFor="feedback-contact">
          Email or phone
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Optional — so we can follow up</p>
        <input
          id="feedback-contact"
          name="contact"
          type="text"
          maxLength={FEEDBACK_CONTACT_MAX}
          autoComplete="off"
          className={fieldClass()}
        />
      </div>

      <input type="hidden" name="sharePermission" value={sharePermission ? "true" : "false"} />
      <label className="flex cursor-pointer gap-2 text-sm text-zinc-800 dark:text-zinc-200">
        <input
          type="checkbox"
          checked={sharePermission}
          onChange={(e) => setSharePermission(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600"
        />
        <span>Track Lucia may share my name and comment on the website or social media.</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
