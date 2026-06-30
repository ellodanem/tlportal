"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type PortalTimezoneFormState,
  updatePortalTimezoneSettings,
} from "@/app/admin/settings/actions";
import {
  DEFAULT_PORTAL_TIMEZONE,
  PORTAL_TIMEZONE_OPTIONS,
} from "@/lib/portal/timezone-options";

const initialState: PortalTimezoneFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Saving…" : "Save timezone & location"}
    </button>
  );
}

function formatLocalPreview(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return "—";
  }
}

export function PortalTimezoneForm({
  initialTimezone,
  initialLocation,
}: {
  initialTimezone: string;
  initialLocation: string;
}) {
  const [state, formAction] = useActionState(updatePortalTimezoneSettings, initialState);
  const [timezone, setTimezone] = useState(initialTimezone || DEFAULT_PORTAL_TIMEZONE);
  const [preview, setPreview] = useState(() => formatLocalPreview(timezone));

  useEffect(() => {
    setPreview(formatLocalPreview(timezone));
    const id = window.setInterval(() => {
      setPreview(formatLocalPreview(timezone));
    }, 30_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-white via-white to-emerald-50/40 p-6 shadow-sm dark:border-emerald-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-emerald-950/25">
      <div className="flex flex-col gap-2 border-b border-emerald-100/80 pb-4 dark:border-emerald-900/50">
        <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">Timezone & location</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Calendar dates for billing WhatsApp reminders and due-date logic use this timezone. Defaults to St. Lucia.
          Set <code className="text-xs">BILLING_REMINDER_TIMEZONE</code> in the environment to override without changing
          this setting.
        </p>
      </div>

      <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
        <div>
          <label htmlFor="businessLocation" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Business location
          </label>
          <input
            id="businessLocation"
            name="businessLocation"
            type="text"
            required
            maxLength={120}
            defaultValue={initialLocation}
            placeholder="St. Lucia"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Shown for staff reference — e.g. where your fleet and billing operations are based.
          </p>
        </div>

        <div>
          <label htmlFor="businessTimezone" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Timezone
          </label>
          <select
            id="businessTimezone"
            name="businessTimezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {PORTAL_TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Local time now: <span className="font-medium text-zinc-800 dark:text-zinc-200">{preview}</span>
          </p>
        </div>

        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">Saved.</p>
        ) : null}

        <SaveButton />
      </form>
    </div>
  );
}
