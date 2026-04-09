import type { DeviceUsagePurpose } from "@prisma/client";

import { DEVICE_USAGE_PURPOSE_BADGE } from "@/lib/admin/device-usage-purpose";

function badgeClass(purpose: DeviceUsagePurpose): string {
  switch (purpose) {
    case "internal_demo":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200";
    case "field_test":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
    case "personal":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

/** Renders a compact label for non-production devices; returns null for customer. */
export function UsagePurposeBadge({ purpose }: { purpose: DeviceUsagePurpose }) {
  const label = DEVICE_USAGE_PURPOSE_BADGE[purpose];
  if (!label) return null;
  return (
    <span
      className={`inline-flex max-w-full shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeClass(purpose)}`}
    >
      {label}
    </span>
  );
}
