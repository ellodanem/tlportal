/**
 * Gross-up so TL nets the listed XCD rate after Stripe processing.
 * Applied to NEW subscription Checkouts only (baked into recurring unit amount).
 *
 * Default assumes a US Stripe account presenting XCD:
 * 2.9% card + 1.5% international + 1% FX, and $0.30 USD fixed at the 2.70 peg.
 */

export const DEFAULT_STRIPE_FEE_PERCENT = 0.054;
export const DEFAULT_STRIPE_FEE_FIXED_USD = 0.3;
export const DEFAULT_XCD_PER_USD = 2.7;

export type StripeFeeRates = {
  percent: number;
  fixedXcd: number;
};

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function parseBoundedNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null || !raw.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export function defaultStripeFeeRates(): StripeFeeRates {
  return {
    percent: DEFAULT_STRIPE_FEE_PERCENT,
    fixedXcd: roundMoney(DEFAULT_STRIPE_FEE_FIXED_USD * DEFAULT_XCD_PER_USD),
  };
}

/** Server env overrides. Invalid values fall back to defaults. */
export function stripeFeeRatesFromEnv(): StripeFeeRates {
  const percent = parseBoundedNumber(
    process.env.STRIPE_FEE_PERCENT,
    DEFAULT_STRIPE_FEE_PERCENT,
    0,
    0.49,
  );
  const fixedUsd = parseBoundedNumber(
    process.env.STRIPE_FEE_FIXED_USD,
    DEFAULT_STRIPE_FEE_FIXED_USD,
    0,
    20,
  );
  const xcdPerUsd = parseBoundedNumber(process.env.XCD_PER_USD, DEFAULT_XCD_PER_USD, 0.01, 20);
  const fixedXcd = parseBoundedNumber(
    process.env.STRIPE_FEE_FIXED_XCD,
    roundMoney(fixedUsd * xcdPerUsd),
    0,
    50,
  );
  return { percent, fixedXcd };
}

/**
 * Amount to charge so after percent + fixed the merchant keeps ≈ net.
 * Ceils to the cent to prefer a slight overcharge.
 */
export function grossUpAmount(net: number, rates: StripeFeeRates = defaultStripeFeeRates()): number {
  if (!Number.isFinite(net) || net <= 0) return 0;
  const p = rates.percent > 0 && rates.percent < 1 ? rates.percent : DEFAULT_STRIPE_FEE_PERCENT;
  const f = rates.fixedXcd >= 0 ? rates.fixedXcd : defaultStripeFeeRates().fixedXcd;
  return Math.ceil(((net + f) / (1 - p)) * 100) / 100;
}

/**
 * Per-vehicle Stripe unit_amount (cents). Fixed fee is applied once on the
 * period total, then spread across quantity so Stripe quantity stays vehicle count.
 */
export function grossUpUnitAmountCents(
  netPeriodTotal: number,
  quantity: number,
  rates: StripeFeeRates = defaultStripeFeeRates(),
): number {
  const qty = Math.max(1, Math.trunc(quantity));
  const grossCents = Math.ceil(grossUpAmount(netPeriodTotal, rates) * 100);
  return Math.ceil(grossCents / qty);
}

export type StripeMetadataLike = Record<string, string> | null | undefined;

export function hasFeePassthroughMetadata(metadata: StripeMetadataLike): boolean {
  return metadata?.tl_fee_passthrough === "1";
}
