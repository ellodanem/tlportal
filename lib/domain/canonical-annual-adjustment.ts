import { createHash } from "node:crypto";

import { addUtcMonths, startOfUtcDay } from "@/lib/billing/recurring-period";
import {
  commercialDateString,
  type AnnualProrationPreview,
} from "@/lib/domain/canonical-subscription-application";

export const CANONICAL_ANNUAL_ADJUSTMENTS_FLAG = "CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED";

export type CanonicalAnnualAdjustmentEnvironment = {
  CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED?: string;
  /** The single owner-controlled production gate for normal staff billing operations. */
  CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export class CanonicalAnnualAdjustmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalAnnualAdjustmentError";
    this.code = code;
  }
}

function adjustmentError(code: string, message: string): never {
  throw new CanonicalAnnualAdjustmentError(code, message);
}

function isProductionEnvironment(environment: CanonicalAnnualAdjustmentEnvironment): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
}

/**
 * Local/test execution needs CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED. Production stays
 * default-deny and is enabled only by the same owner-controlled global flag that
 * governs canonical activation and billing (CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED).
 * The per-feature adjustment flag alone can never enable production execution.
 */
export function canonicalAnnualAdjustmentExecutionEnabled(
  environment: CanonicalAnnualAdjustmentEnvironment = process.env,
): boolean {
  if (isProductionEnvironment(environment)) {
    return environment.CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED === "true";
  }
  return environment.CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED === "true";
}

export function assertCanonicalAnnualAdjustmentExecutionEnabled(
  environment: CanonicalAnnualAdjustmentEnvironment = process.env,
): void {
  if (isProductionEnvironment(environment)) {
    if (environment.CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED === "true") return;
    adjustmentError(
      "PRODUCTION_EXECUTION_DISABLED",
      "Adjustment invoices are disabled in production until the owner enables normal staff billing operations.",
    );
  }
  if (environment.CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED !== "true") {
    adjustmentError(
      "FEATURE_DISABLED",
      `${CANONICAL_ANNUAL_ADJUSTMENTS_FLAG}=true is required for local annual adjustment execution.`,
    );
  }
}

export function annualAdjustmentGenerationKey(
  subscriptionItemId: string,
  periodStart: Date | string,
  periodEnd: Date | string,
): string {
  const dateOnly = (value: Date | string): string =>
    typeof value === "string" ? value : commercialDateString(startOfUtcDay(value));
  return `annual-proration:${subscriptionItemId}:${dateOnly(periodStart)}:${dateOnly(periodEnd)}`;
}

/**
 * Resolve the half-open annual period [periodStart, nextBillingDate) from the
 * subscription's original anchor. The exact next date must remain on that
 * anniversary cadence; Phase 3P never repairs or moves it.
 */
export function resolveCurrentAnnualPeriod(input: {
  billingAnchorDate: Date;
  nextBillingDate: Date;
  /** Defaults to the annual cadence; other cadences step by their own interval. */
  intervalMonths?: number;
}): { periodStart: Date; periodEnd: Date } {
  const step = input.intervalMonths ?? 12;
  const anchor = startOfUtcDay(input.billingAnchorDate);
  const periodEnd = startOfUtcDay(input.nextBillingDate);
  if (periodEnd <= anchor) {
    adjustmentError(
      "INVALID_ANNUAL_ANNIVERSARY",
      "The next annual billing date must be later than the billing anchor date.",
    );
  }

  let periodStart = anchor;
  let candidate = addUtcMonths(periodStart, step);
  let iterations = 0;
  while (candidate < periodEnd && iterations < 200) {
    periodStart = candidate;
    candidate = addUtcMonths(periodStart, step);
    iterations += 1;
  }
  if (candidate.getTime() !== periodEnd.getTime()) {
    adjustmentError(
      "ANNUAL_ANNIVERSARY_MISMATCH",
      "The next billing date is not on the subscription's preserved annual anniversary.",
    );
  }
  return { periodStart, periodEnd };
}

export type AnnualAdjustmentConfirmationInput = {
  subscriptionId: string;
  subscriptionItemId: string;
  subscriptionItemRateId: string;
  generationKey: string;
  collectionMethod: string;
  preview: AnnualProrationPreview;
};

/** Stable stale-preview guard. It authorizes no action by itself. */
export function annualAdjustmentConfirmationToken(
  input: AnnualAdjustmentConfirmationInput,
): string {
  const canonical = [
    "annual-adjustment-v1",
    input.subscriptionId,
    input.subscriptionItemId,
    input.subscriptionItemRateId,
    input.generationKey,
    input.collectionMethod,
    input.preview.currency,
    input.preview.periodStart,
    input.preview.periodEnd,
    input.preview.prorationStart,
    input.preview.agreedAnnualAmount.toFixed(2),
    input.preview.proratedAmount.toFixed(2),
    String(input.preview.totalCalendarDays),
    String(input.preview.remainingCalendarDays),
  ].join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
