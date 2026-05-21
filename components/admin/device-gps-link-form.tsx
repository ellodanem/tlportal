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
}: {
  deviceId: string;
  defaults: GpsLinkDefaults;
  openTrackingUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateDeviceGpsLink, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="deviceId" value={deviceId} />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Per-device GPS portal access. Customer-level Traqcare fields are legacy — configure tracking here for new
        workflows.
      </p>

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
        Vendor device ID (optional)
        <input
          id="gps-externalDeviceId"
          name="externalDeviceId"
          type="text"
          defaultValue={defaults.externalDeviceId}
          placeholder="If different from IMEI"
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="gps-externalAccountRef">
        Account / username ref (optional)
        <input
          id="gps-externalAccountRef"
          name="externalAccountRef"
          type="text"
          defaultValue={defaults.externalAccountRef}
          placeholder="Portal login or fleet account"
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
