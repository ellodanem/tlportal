"use client";

import { useActionState, useState } from "react";

import { updateCustomerNew } from "@/app/admin/customer-new/actions";
import { customerFormInitialState } from "@/app/admin/customers/customer-form-state";

const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white min-h-11 px-3 py-2 text-base text-zinc-900 shadow-sm outline-none focus:border-emerald-500 sm:min-h-10 sm:text-sm focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function CustomerGpsCard({
  customerId,
  clientId,
  portalUrl,
}: {
  customerId: string;
  clientId: string | null;
  portalUrl: string | null;
}) {
  const empty = !clientId && !portalUrl;
  const [editing, setEditing] = useState(empty);
  const [state, formAction] = useActionState(updateCustomerNew, customerFormInitialState);

  return (
    <section id="customer-gps" className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm @lg:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">GPS</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Fleet-level Traqcare settings. Portal logins are managed under Portal users.
          </p>
        </div>
        {editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            Edit GPS
          </button>
        )}
      </div>

      {editing ? (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={customerId} />
          <input type="hidden" name="section" value="gps" />
          {state.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {state.error}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="traqcareClientId">
              Client ID (live API)
            </label>
            <input
              id="traqcareClientId"
              name="traqcareClientId"
              autoComplete="off"
              defaultValue={clientId ?? ""}
              placeholder="6a0dfdc8ab135d26b78cc035"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Copy from Traqcare for this fleet. Applies to all their devices unless a device has an override.
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="traqcarePortalUrl">
              Portal URL
            </label>
            <input
              id="traqcarePortalUrl"
              name="traqcarePortalUrl"
              type="url"
              inputMode="url"
              defaultValue={portalUrl ?? ""}
              placeholder="https://"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-500">Use if this customer uses a non-default or white-label Traqcare URL.</p>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {empty ? null : (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Save GPS
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Client ID</dt>
            <dd className="mt-1 break-all text-sm text-zinc-900 dark:text-zinc-100">{clientId || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Portal URL</dt>
            <dd className="mt-1 break-all text-sm text-zinc-900 dark:text-zinc-100">
              {portalUrl ? (
                <a href={portalUrl} className="text-emerald-700 hover:underline dark:text-emerald-400">
                  {portalUrl}
                </a>
              ) : (
                "Not provided"
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
