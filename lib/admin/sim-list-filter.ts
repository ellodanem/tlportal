import type { DeviceUsagePurpose } from "@prisma/client";

import { DEVICE_USAGE_PURPOSE_LABEL } from "@/lib/admin/device-usage-purpose";

/** Serializable SIM row for the admin SIM list (server → client). */
export type SimListRow = {
  id: string;
  iccid: string;
  label: string | null;
  status: string | null;
  usedDataMB: number | null;
  totalDataMB: number | null;
  /** Inherited from linked device; null if SIM is not linked. */
  deviceUsagePurpose: DeviceUsagePurpose | null;
  deviceTags: string[];
  device: {
    label: string | null;
    imei: string;
    deviceModel: { name: string };
  } | null;
};

export function simMatchesSearchQuery(row: SimListRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (row.iccid.toLowerCase().includes(q)) return true;
  if (row.label?.trim() && row.label.toLowerCase().includes(q)) return true;

  const d = row.device;
  if (d) {
    if (d.imei.toLowerCase().includes(q)) return true;
    if (d.label?.trim() && d.label.toLowerCase().includes(q)) return true;
    if (d.deviceModel.name.toLowerCase().includes(q)) return true;
  }

  if (row.deviceUsagePurpose) {
    if (DEVICE_USAGE_PURPOSE_LABEL[row.deviceUsagePurpose].toLowerCase().includes(q)) return true;
  }
  for (const t of row.deviceTags) {
    if (t.toLowerCase().includes(q)) return true;
  }

  return false;
}
