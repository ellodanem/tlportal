/**
 * Pure, dependency-free partial-period ("proration") rules for services that join a
 * subscription between renewals. It is safe to import from both server and client
 * code: all money is integer minor units and all dates are date-only strings.
 *
 * Three explicit methods exist so a negotiated amount is never confused with the
 * default engine:
 *  - daily_proration: exact calendar days remaining in the cycle, half-up to 2dp.
 *  - monthly_rounded: whole months (nearest, half-up) x (agreed cycle price / cycle months).
 *  - manual_amount:   a staff-agreed figure, capped at one cycle, with a required reason.
 *
 * Every method starts from the AGREED cycle price (e.g. EC$330/year), never from a
 * list price, so an annual "free month" discount that is already baked into the
 * agreed price is never deducted a second time.
 */

export const SUBSCRIPTION_PRORATION_METHODS = ["daily_proration", "monthly_rounded", "manual_amount"] as const;
export type SubscriptionProrationMethod = (typeof SUBSCRIPTION_PRORATION_METHODS)[number];

export class SubscriptionProrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SubscriptionProrationError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new SubscriptionProrationError(code, message);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseDate(value: string, field: string): number {
  if (!DATE_ONLY.test(value)) fail("INVALID_DATE", `${field} must use YYYY-MM-DD.`);
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    fail("INVALID_DATE", `${field} must be a valid calendar date.`);
  }
  return ms;
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar-month arithmetic that clamps to the last day of the target month. */
export function addMonthsClamped(value: string, months: number): string {
  const ms = parseDate(value, "date");
  const date = new Date(ms);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toDateString(target.getTime());
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end, "end") - parseDate(start, "start")) / DAY_MS);
}

export function addDays(value: string, days: number): string {
  return toDateString(parseDate(value, "date") + days * DAY_MS);
}

/** Parse a decimal amount with at most two decimal places into minor units. */
export function parseMoneyToCents(value: string | number, field = "amount"): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    fail("INVALID_AMOUNT", `${field} must be a non-negative amount with at most two decimal places.`);
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > 99_999_999_999) fail("INVALID_AMOUNT", `${field} exceeds the supported amount.`);
  return cents;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Half-up integer division of non-negative integers. */
function divideHalfUp(numerator: number, denominator: number): number {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return Number((BigInt(2) * n + d) / (BigInt(2) * d));
}

export type CycleWindow = { cycleStart: string; cycleEnd: string; totalDays: number };

/** The billing cycle that ends on the renewal date (half-open: [cycleStart, cycleEnd)). */
export function cycleWindowForRenewal(renewalDate: string, intervalMonths: number): CycleWindow {
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 12) {
    fail("INVALID_INTERVAL", "Billing interval must be between 1 and 12 months.");
  }
  const cycleStart = addMonthsClamped(renewalDate, -intervalMonths);
  return { cycleStart, cycleEnd: renewalDate, totalDays: daysBetween(cycleStart, renewalDate) };
}

/** Whole months from start to the renewal, rounded to the nearest month (half rounds up). */
export function roundedMonthsBetween(start: string, renewalDate: string): number {
  if (daysBetween(start, renewalDate) < 0) fail("START_AFTER_RENEWAL", "Service start cannot be after the renewal date.");
  let months = 0;
  while (addMonthsClamped(start, months + 1) <= renewalDate) months += 1;
  const lower = addMonthsClamped(start, months);
  const upper = addMonthsClamped(start, months + 1);
  const remainder = daysBetween(lower, renewalDate);
  const length = daysBetween(lower, upper);
  return remainder * 2 >= length && remainder > 0 ? months + 1 : months;
}

export type ProrationInput = {
  /** Date the service starts (first day covered by the adjustment). */
  startDate: string;
  /** Renewal date the service joins the full recurring cycle (exclusive end). */
  renewalDate: string;
  billingIntervalMonths: number;
  /** Agreed price for ONE full cycle of this service, e.g. "330.00". */
  cycleAmount: string | number;
  currency: string;
  method: SubscriptionProrationMethod;
  manualAmount?: string | number | null;
  reason?: string | null;
};

export type ProrationResult = {
  method: SubscriptionProrationMethod;
  currency: string;
  startDate: string;
  renewalDate: string;
  /** Last day covered by the partial period (renewal date minus one day). */
  coveredThrough: string;
  cycleStart: string;
  totalDays: number;
  remainingDays: number;
  cycleAmount: string;
  amount: string;
  amountCents: number;
  /** Amount the default daily engine would charge for the same period. */
  dailyAmount: string;
  dailyAmountCents: number;
  /** Set for monthly_rounded only. */
  roundedMonths: number | null;
  monthlyRate: string | null;
  reason: string | null;
  /** True when the amount differs from the default daily engine and therefore needs audit context. */
  isOverride: boolean;
  explanation: string;
};

export function computeProration(input: ProrationInput): ProrationResult {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail("INVALID_CURRENCY", "Currency must be a three-letter code.");
  if (!SUBSCRIPTION_PRORATION_METHODS.includes(input.method)) fail("INVALID_METHOD", "Choose a valid adjustment method.");
  const cycleCents = parseMoneyToCents(input.cycleAmount, "cycleAmount");
  const window = cycleWindowForRenewal(input.renewalDate, input.billingIntervalMonths);
  parseDate(input.startDate, "startDate");
  if (input.startDate < window.cycleStart) {
    fail("START_BEFORE_CYCLE", `Service start must fall within the current cycle (${window.cycleStart} to ${window.cycleEnd}).`);
  }
  if (input.startDate > input.renewalDate) {
    fail("START_AFTER_RENEWAL", "Service start cannot be after the renewal date.");
  }

  const remainingDays = daysBetween(input.startDate, input.renewalDate);
  const dailyAmountCents = divideHalfUp(cycleCents * remainingDays, window.totalDays);
  const reason = input.reason?.trim() ? input.reason.trim() : null;

  let amountCents = dailyAmountCents;
  let roundedMonths: number | null = null;
  let monthlyRate: string | null = null;
  let explanation = `${remainingDays} of ${window.totalDays} calendar days at the agreed cycle price.`;

  if (input.method === "monthly_rounded") {
    const monthlyCents = divideHalfUp(cycleCents, input.billingIntervalMonths);
    roundedMonths = roundedMonthsBetween(input.startDate, input.renewalDate);
    amountCents = Math.min(monthlyCents * roundedMonths, cycleCents);
    monthlyRate = formatCents(monthlyCents);
    explanation = `${roundedMonths} rounded month${roundedMonths === 1 ? "" : "s"} x ${monthlyRate} per month (agreed cycle price / ${input.billingIntervalMonths}).`;
    if (!reason) fail("REASON_REQUIRED", "Record why the rounded-month amount was agreed.");
  } else if (input.method === "manual_amount") {
    if (input.manualAmount == null || String(input.manualAmount).trim() === "") {
      fail("MANUAL_AMOUNT_REQUIRED", "Enter the agreed adjustment amount.");
    }
    amountCents = parseMoneyToCents(input.manualAmount, "manualAmount");
    if (amountCents > cycleCents) fail("MANUAL_AMOUNT_EXCEEDS_CYCLE", "A partial-period charge cannot exceed one full cycle price.");
    explanation = "Amount agreed manually with the customer.";
    if (!reason) fail("REASON_REQUIRED", "Record why this amount was agreed.");
  }

  return {
    method: input.method,
    currency,
    startDate: input.startDate,
    renewalDate: input.renewalDate,
    coveredThrough: addDays(input.renewalDate, -1),
    cycleStart: window.cycleStart,
    totalDays: window.totalDays,
    remainingDays,
    cycleAmount: formatCents(cycleCents),
    amount: formatCents(amountCents),
    amountCents,
    dailyAmount: formatCents(dailyAmountCents),
    dailyAmountCents,
    roundedMonths,
    monthlyRate,
    reason,
    isOverride: amountCents !== dailyAmountCents || input.method !== "daily_proration",
    explanation,
  };
}

export type RecurringTotals = {
  currentCents: number;
  futureCents: number;
  addedCents: number;
};

/**
 * Recurring total before and after a service joins. Only the SAME subscription's
 * services are combined; callers must never pass services from another cadence.
 */
export function recurringTotalsAfterAddition(existingCycleAmounts: (string | number)[], addedCycleAmount: string | number): RecurringTotals {
  const currentCents = existingCycleAmounts.reduce<number>((sum, amount) => sum + parseMoneyToCents(amount), 0);
  const addedCents = parseMoneyToCents(addedCycleAmount, "cycleAmount");
  return { currentCents, addedCents, futureCents: currentCents + addedCents };
}

export function cadenceLabel(months: number | null | undefined): string {
  if (months === 1) return "Monthly";
  if (months === 3) return "Quarterly";
  if (months === 4) return "Every 4 months";
  if (months === 6) return "Every 6 months";
  if (months === 12) return "Annual";
  return "Not configured";
}

export function cycleUnitLabel(months: number | null | undefined): string {
  if (months === 1) return "month";
  if (months === 3) return "quarter";
  if (months === 4) return "4 months";
  if (months === 6) return "6 months";
  if (months === 12) return "year";
  return "cycle";
}
