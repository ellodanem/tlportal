"use client";

import { useState } from "react";

export type DevicePickerDevice = {
  id: string;
  label: string;
  simLabel: string | null;
  imei: string;
  iccid: string | null;
};

/**
 * Searchable, scrollable device list shared by "Add service" and "New subscription".
 * Posts the selection as a hidden input named `name` (default `deviceId`).
 */
export function DevicePicker({
  devices,
  value,
  onChange,
  name = "deviceId",
  disabledIds,
  allowClear = false,
}: {
  devices: DevicePickerDevice[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  /** Devices already chosen elsewhere in the form; shown but not selectable. */
  disabledIds?: ReadonlySet<string>;
  /** Show a "Clear" control so the selection can be reset to none. */
  allowClear?: boolean;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? devices.filter((device) => `${device.label} ${device.imei} ${device.simLabel ?? ""} ${device.iccid ?? ""}`.toLowerCase().includes(needle))
    : devices;

  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="text-xs text-zinc-500">Choose from available hardware</span>
        <a
          href="/admin/devices"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          Open Devices ↗
        </a>
      </div>
      <input type="hidden" name={name} value={value} />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        placeholder="Search by name, IMEI or SIM"
        aria-label="Search available devices"
        className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <ul role="listbox" aria-label="Available devices" className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-md border border-zinc-100 dark:border-zinc-800">
        {visible.length ? visible.map((device) => {
          const selected = device.id === value;
          const taken = !selected && Boolean(disabledIds?.has(device.id));
          return (
            <li key={device.id} role="option" aria-selected={selected} aria-disabled={taken}>
              <button
                type="button"
                disabled={taken}
                onClick={() => onChange(device.id)}
                className={`flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${selected ? "bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" : taken ? "cursor-not-allowed opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
              >
                <span className="min-w-0 break-words">{device.label} <span className="text-xs font-normal text-zinc-500">· {device.imei}</span>{taken ? <span className="text-xs font-normal text-zinc-500"> · used above</span> : null}</span>
                <span className="text-xs font-normal text-zinc-500">{device.simLabel ?? "no SIM"}</span>
              </button>
            </li>
          );
        }) : <li className="px-3 py-4 text-center text-sm text-zinc-500">No devices match “{query}”.</li>}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-zinc-500">{value ? `Selected: ${devices.find((device) => device.id === value)?.label ?? "device"}` : `${visible.length} of ${devices.length} shown`}</p>
        {allowClear && value ? (
          <button type="button" onClick={() => onChange("")} className="min-h-8 shrink-0 text-xs font-semibold text-red-700 hover:underline dark:text-red-300">Clear</button>
        ) : null}
      </div>
    </div>
  );
}
