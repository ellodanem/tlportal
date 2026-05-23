"use client";

import { useActionState } from "react";

import { updateDeviceGpsLink } from "@/app/admin/devices/gps-link-actions";
import type { DeviceFormActionState } from "@/app/admin/devices/device-form-state";

const initialState: DeviceFormActionState = { error: null };

type GpsLinkDefaults = {
  portalUrl: string;
  externalDeviceId: string;
  externalAccountRef: string;
};

export function DeviceGpsLinkForm({
  deviceId,
  defaults,
  openTrackingUrl,
  customerTraqcareClientId,
  customerLabel,
}: {
  deviceId: string;
  defaults: GpsLinkDefaults;
  openTrackingUrl: string | null;
  /** Fleet `clientid` from the assigned customer's record (if any). */
  customerTraqcareClientId?: string | null;
  customerLabel?: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateDeviceGpsLink, initialState);
  const fleetClientId = customerTraqcareClientId?.trim() || null;

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="deviceId" value={deviceId} />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Per-device portal and object identifiers. The Traqcare fleet client ID is set once on the customer — you do not
        need to repeat it on every device.
      </p>

      {fleetClientId ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/50">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Fleet client ID (from customer)
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-800 dark:text-zinc-200">{fleetClientId}</p>
          {customerLabel ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{customerLabel}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          No fleet client ID yet — add it on the customer record (Traqcare client ID), or use an override below if this
          device belongs to a different Traqcare fleet.
        </p>
      )}

      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="gps-portalUrl">
        Portal URL
        <input
          id="gps-portalUrl"
          name="portalUrl"
          type="url"
          defaultValue={defaults.portalUrl}
          placeholder="https://…"
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500">Leave blank to use the default Traqcare portal.</span>
      </label>

      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="gps-externalDeviceId">
        Traqcare object name / vendor id (optional)
        <input
          id="gps-externalDeviceId"
          name="externalDeviceId"
          type="text"
          defaultValue={defaults.externalDeviceId}
          placeholder="e.g. AR5221XXX — object label in Traqcare"
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500">
          Live API `oname` when it differs from IMEI. IMEI is taken from this device&apos;s IMEI field.
        </span>
      </label>

      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="gps-externalAccountRef">
        Override fleet client ID (optional)
        <input
          id="gps-externalAccountRef"
          name="externalAccountRef"
          type="text"
          defaultValue={defaults.externalAccountRef}
          placeholder="Only if not using the customer fleet id"
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
        >
          {pending ? "Saving…" : "Save GPS link"}
        </button>
        {openTrackingUrl ? (
          <a
            href={openTrackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Open tracking portal ↗
          </a>
        ) : null}
      </div>
    </form>
  );
}
