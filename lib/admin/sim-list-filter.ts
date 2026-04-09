/** Serializable SIM row for the admin SIM list (server → client). */
export type SimListRow = {
  id: string;
  iccid: string;
  label: string | null;
  status: string | null;
  usedDataMB: number | null;
  totalDataMB: number | null;
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

  return false;
}
