/** Unlinked SIM row for register-device picker (server → client). */
export type UnlinkedSimRow = {
  id: string;
  iccid: string;
  label: string | null;
  msisdn: string | null;
};

export function unlinkedSimMatchesQuery(row: UnlinkedSimRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;

  if (row.iccid.toLowerCase().includes(q)) return true;
  if (row.msisdn?.trim() && row.msisdn.toLowerCase().includes(q)) return true;
  if (row.label?.trim() && row.label.toLowerCase().includes(q)) return true;

  return false;
}

/** Empty query returns the full list; otherwise filters by ICCID, MSISDN, or label. */
export function filterUnlinkedSims(sims: UnlinkedSimRow[], query: string): UnlinkedSimRow[] {
  const q = query.trim();
  if (!q) return sims;
  return sims.filter((s) => unlinkedSimMatchesQuery(s, q));
}
