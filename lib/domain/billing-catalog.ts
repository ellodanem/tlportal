/** Standard per-vehicle monthly rate tiers (XCD) with fixed Stripe catalog Prices. */
export const CATALOG_RATE_TIERS_XCD = [30, 25, 20] as const;

export type CatalogRateTierXcd = (typeof CATALOG_RATE_TIERS_XCD)[number];

export function normalizeRateXcd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isCatalogRateTier(monthlyRateXcd: number): boolean {
  const n = normalizeRateXcd(monthlyRateXcd);
  return (CATALOG_RATE_TIERS_XCD as readonly number[]).includes(n);
}

export function catalogTierLabel(monthlyRateXcd: number): string {
  return `${monthlyRateXcd} XCD / vehicle / month`;
}
