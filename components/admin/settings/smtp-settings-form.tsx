"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type SmtpSettingsFormState,
  updateSmtpSettings,
} from "@/app/admin/settings/actions";
import type { SmtpSettingsFormValues } from "@/lib/email/smtp-settings";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:hover:bg-amber-400"
    >
      {pending ? "Saving…" : "Save SMTP settings"}
    </button>
  );
}

const initialState: SmtpSettingsFormState = {};

export function SmtpSettingsForm({ initial }: { initial: SmtpSettingsFormValues }) {
  const [state, formAction] = useActionState(updateSmtpSettings, initialState);

  return (
    <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-white via-white to-amber-50/40 p-6 shadow-sm dark:border-amber-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/25">
      <div className="flex flex-col gap-2 border-b border-amber-100/80 pb-4 dark:border-amber-900/50">
        <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">Email (SMTP)</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Outgoing mail server for future notifications and reports. Leave <strong>SMTP host</strong> empty to disable.
          For production you can set{" "}
          <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs dark:bg-amber-950/60">SMTP_PASSWORD</code> in the
          environment instead of storing a password here.
        </p>
      </div>

      <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
        <div>
          <label htmlFor="smtpHost" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            SMTP host
          </label>
          <input
            id="smtpHost"
            name="smtpHost"
            type="text"
            autoComplete="off"
            placeholder="e.g. smtp.example.com"
            defaultValue={initial.host}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="smtpPort" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Port
            </label>
            <input
              id="smtpPort"
              name="smtpPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={initial.port}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="smtpSecure"
                value="on"
                defaultChecked={initial.secure}
                className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-900"
              />
              Use implicit TLS (SSL)
              <span className="sr-only">Typical for port 465</span>
            </label>
          </div>
        </div>
        <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Port 587 usually uses STARTTLS with this option off; port 465 often uses implicit TLS with this on.
        </p>

        <div>
          <label htmlFor="smtpUser" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Username
          </label>
          <input
            id="smtpUser"
            name="smtpUser"
            type="text"
            autoComplete="username"
            placeholder="Optional"
            defaultValue={initial.user}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div>
          <label htmlFor="smtpPassword" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Password
          </label>
          <input
            id="smtpPassword"
            name="smtpPassword"
            type="password"
            autoComplete="new-password"
            placeholder={
              initial.hasStoredPassword ? "Leave blank to keep current password" : "Optional — add when ready"
            }
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
          {initial.hasStoredPassword ? (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                name="smtpClearPassword"
                value="on"
                className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-900"
              />
              Remove stored password
            </label>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="smtpFromEmail" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              From email
            </label>
            <input
              id="smtpFromEmail"
              name="smtpFromEmail"
              type="email"
              autoComplete="off"
              placeholder="noreply@example.com"
              defaultValue={initial.fromEmail}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="smtpFromName" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              From display name
            </label>
            <input
              id="smtpFromName"
              name="smtpFromName"
              type="text"
              autoComplete="off"
              placeholder="Track Lucia"
              defaultValue={initial.fromName}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>

        {state.error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">SMTP settings saved.</p>
        ) : null}

        <SubmitButton />
      </form>
    </div>
  );
}
