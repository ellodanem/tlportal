/** Fixed billing terms on the public registration form (admin edits price only). */
export const SUBSCRIPTION_PLAN_MONTHS = [1, 3, 6, 12] as const;
export type SubscriptionPlanMonths = (typeof SUBSCRIPTION_PLAN_MONTHS)[number];

/** Display label: "1 month", "3 month", … (matches product copy). */
export function formatPlanTerm(months: number): string {
  return `${months} month`;
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

/** Dropdown / notes line, e.g. "3 month - EC$90.00". */
export function formatSubscriptionChoiceLabel(
  months: number,
  priceXcd: number | string | { toString(): string },
): string {
  return `${formatPlanTerm(months)} - ${formatXcd(priceXcd)}`;
}
