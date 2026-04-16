/** Fixed billing terms on the public registration form (admin edits price only). */
export const SUBSCRIPTION_PLAN_MONTHS = [1, 3, 6, 12] as const;
export type SubscriptionPlanMonths = (typeof SUBSCRIPTION_PLAN_MONTHS)[number];

const PLAN_MONTHS_SET: ReadonlySet<number> = new Set(SUBSCRIPTION_PLAN_MONTHS);

/**
 * Parse admin form value for `ServiceAssignment.intervalMonths`.
 * Empty string clears the field (null). Otherwise must be one of SUBSCRIPTION_PLAN_MONTHS.
 */
export function parseSubscriptionIntervalMonths(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) {
    return { ok: true, value: null };
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || !PLAN_MONTHS_SET.has(n)) {
    return {
      ok: false,
      error: "Choose a billing term of 1, 3, 6, or 12 months, or leave unset.",
    };
  }
  return { ok: true, value: n };
}

/** Display label: "1 month", "3 months", … (grammatical plural). */
export function formatPlanTerm(months: number): string {
  const n = Math.trunc(months);
  return n === 1 ? "1 month" : `${n} months`;
}

const xcdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "XCD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format stored plan amount as Eastern Caribbean dollars (XCD). */
export function formatXcd(price: number | string | { toString(): string }): string {
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return "—";
  return xcdFormatter.format(n);
}

/** Dropdown / notes line, e.g. "3 months - EC$90.00". */
export function formatSubscriptionChoiceLabel(
  months: number,
  priceXcd: number | string | { toString(): string },
): string {
  return `${formatPlanTerm(months)} - ${formatXcd(priceXcd)}`;
}
