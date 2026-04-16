"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateDeviceCommercialFields } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import type { DeviceObjectType, DeviceUsagePurpose } from "@prisma/client";

import {
  DEVICE_OBJECT_TYPE_LABEL,
  DEVICE_OBJECT_TYPE_ORDER,
} from "@/lib/admin/device-object-type";
import { DEVICE_USAGE_PURPOSE_LABEL } from "@/lib/admin/device-usage-purpose";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

const PURPOSE_ORDER: DeviceUsagePurpose[] = [
  "customer",
  "internal_demo",
  "field_test",
  "personal",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function DeviceCommercialEditForm({
  deviceId,
  defaultLabel,
  objectType,
  usagePurpose,
  tags,
}: {
  deviceId: string;
  /** Friendly name in lists (maps to `Device.label`). */
  defaultLabel: string;
  objectType: DeviceObjectType | null;
  usagePurpose: DeviceUsagePurpose;
  tags: string[];
}) {
  const [state, formAction] = useActionState(updateDeviceCommercialFields, deviceFormInitialState);
  const tagsJoined = tags.join(", ");

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="deviceId" value={deviceId} />

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="device-label">
          Device name
        </label>
        <input
          id="device-label"
          name="label"
          type="text"
          defaultValue={defaultLabel}
          placeholder="e.g. TJ2756 - Changan"
          autoComplete="off"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Shown in the devices list and customer views. Leave blank to show only IMEI.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="objectType">
          Object type
        </label>
        <select
          id="objectType"
          name="objectType"
          className={inputClass}
          defaultValue={objectType ?? ""}
        >
          <option value="">Not set</option>
          {DEVICE_OBJECT_TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {DEVICE_OBJECT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Icon appears on the device header and in lists. Add more types in the database schema when needed.
        </p>
      </div>

      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="usagePurpose">
          Usage purpose
        </label>
        <select
          id="usagePurpose"
          name="usagePurpose"
          className={inputClass}
          defaultValue={usagePurpose}
        >
          {PURPOSE_ORDER.map((p) => (
            <option key={p} value={p}>
              {DEVICE_USAGE_PURPOSE_LABEL[p]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Production devices count toward the dashboard fleet summary; internal and personal units are excluded unless
          you include them in list filters.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="tags">
          Tags
        </label>
        <input
          id="tags"
          name="tags"
          defaultValue={tagsJoined}
          placeholder="e.g. demo-booth, lab-a"
          autoComplete="off"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Comma-separated labels for search and reporting.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <SubmitButton />
        <Link
          href="/admin/devices"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Back to devices
        </Link>
      </div>
    </form>
  );
}
