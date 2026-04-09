"use client";

import type { DevicePurposeScope } from "@/lib/admin/device-usage-purpose";
import { DEVICE_PURPOSE_SCOPE_LABEL } from "@/lib/admin/device-usage-purpose";

const SCOPES: DevicePurposeScope[] = ["customer_only", "include_all", "internal_only"];

const selectClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Props = {
  value: DevicePurposeScope;
  onChange: (next: DevicePurposeScope) => void;
  id?: string;
  /** e.g. "devices" or "SIMs" */
  entityLabel: string;
};

export function PurposeScopeFilter({ value, onChange, id = "purpose-scope", entityLabel }: Props) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:max-w-xs">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Show {entityLabel}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as DevicePurposeScope)}
        className={selectClass}
      >
        {SCOPES.map((k) => (
          <option key={k} value={k}>
            {DEVICE_PURPOSE_SCOPE_LABEL[k]}
          </option>
        ))}
      </select>
    </div>
  );
}
