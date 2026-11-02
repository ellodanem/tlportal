/**
 * Asset loss: the tracked asset (boat, vehicle, ...) is gone for good and the tracker cannot be
 * recovered (sank, stolen, burned, written off). Distinct from "vehicle sold" where the tracker
 * comes back to TL, and from a temporary pause.
 */
export type AssetLossReason = "sank" | "stolen" | "destroyed" | "other";

export const ASSET_LOSS_REASON_LABEL: Record<AssetLossReason, string> = {
  sank: "Sank / lost at sea",
  stolen: "Stolen",
  destroyed: "Destroyed (fire, crash, write-off)",
  other: "Other / unrecoverable",
};

export const ASSET_LOSS_REASONS = Object.keys(ASSET_LOSS_REASON_LABEL) as AssetLossReason[];

export function parseAssetLossReason(raw: string): AssetLossReason | null {
  const v = raw.trim() as AssetLossReason;
  return ASSET_LOSS_REASONS.includes(v) ? v : null;
}

/** Every asset-loss audit note starts with this, so a recorded loss can be recognised from the note. */
export const ASSET_LOSS_NOTE_PREFIX = "Asset lost —";

export function hasAssetLossNote(notes: string | null | undefined): boolean {
  return Boolean(notes?.includes(ASSET_LOSS_NOTE_PREFIX));
}

/** One-line audit note appended to the assignment and device notes. */
export function assetLossNote(input: { reason: AssetLossReason; lossDate: string; note?: string | null }): string {
  const base = `${ASSET_LOSS_NOTE_PREFIX} ${ASSET_LOSS_REASON_LABEL[input.reason]} (${input.lossDate}); tracker unrecoverable.`;
  const extra = input.note?.trim();
  return extra ? `${base} ${extra}` : base;
}

export function appendNote(existing: string | null | undefined, addition: string): string {
  const current = existing?.trim();
  return current ? `${current}\n${addition}` : addition;
}

/** Parse a `YYYY-MM-DD` form value to a UTC-midnight date (matches how commercial dates are stored). */
export function parseLossDate(raw: string): Date | null {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}
