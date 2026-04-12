/** Fixed billing terms on the public registration form (admin edits price only). */
export const SUBSCRIPTION_PLAN_MONTHS = [1, 3, 6, 12] as const;
export type SubscriptionPlanMonths = (typeof SUBSCRIPTION_PLAN_MONTHS)[number];

/** Display label: "1 month", "3 month", … (matches product copy). */
export function formatPlanTerm(months: number): string {
  return `${months} month`;
}

export function formatUsd(price: number | string | { toString(): string }): string {
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return "$—";
  const disp = Math.abs(n % 1) < 1e-9 ? n.toFixed(0) : n.toFixed(2);
  return `$${disp}`;
}

/** Dropdown / notes line, e.g. "3 month - $90". */
export function formatSubscriptionChoiceLabel(
  months: number,
  priceUsd: number | string | { toString(): string },
): string {
  return `${formatPlanTerm(months)} - ${formatUsd(priceUsd)}`;
}
