import { formatExpenseAmount } from "@/lib/domain/expenses";

export function iso(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

export function displayDate(value: Date | null | undefined, fallback = "Not scheduled") {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) ?? fallback;
}

export function displayDateTime(value: Date | null | undefined) {
  return value?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "";
}

export function money(value: string | number | null | undefined, currency = "XCD") {
  return value == null ? "—" : formatExpenseAmount(Number(value), currency);
}

export function collectionLabel(value: string | null) {
  if (value === "stripe_autocharge") return "Automatic card billing";
  if (value === "manual_invoice") return "Recurring invoice";
  return "Not configured";
}

/**
 * Billing readiness issues come from the native recurring-invoice execution check (manual
 * collection, one open recurring schedule, canonical control). They describe whether this app can
 * issue invoices itself, so they are meaningless, and misleading, for a subscription Stripe
 * collects (or one with no collection method yet). Only manual-invoice subscriptions show them.
 */
export function nativeBillingReadinessIssues(subscription: {
  collectionMethod: string | null;
  summary?: { validationIssues: { code: string; message: string }[] } | null;
}): { code: string; message: string }[] {
  if (subscription.collectionMethod !== "manual_invoice") return [];
  return subscription.summary?.validationIssues ?? [];
}

export function authorityLabel(access: string) {
  if (access === "canonical_operational" || access === "editable_draft") return "Canonical";
  if (access.includes("shadow")) return "Source-controlled";
  return "Read-only";
}

export function adjustmentMethodLabel(method: string) {
  if (method === "monthly_rounded") return "Agreed by rounded months";
  if (method === "manual_amount") return "Agreed amount";
  return "Daily proration";
}

export function cycleUnit(months: number | null) {
  if (months === 1) return "month";
  if (months === 3) return "quarter";
  if (months === 6) return "6 months";
  if (months === 12) return "year";
  return "cycle";
}

type ItemBillingWindow = {
  status: string;
  billingEffectiveFrom: Date | null;
  billingEffectiveUntil: Date | null;
};

/**
 * Whether a service is part of the recurring total at a given date. This mirrors the billing
 * resolver (half-open [from, until)) so counts shown beside the total agree with it.
 */
export function billsOnDate(item: ItemBillingWindow, date: Date | null): boolean {
  if (["ended", "canceled"].includes(item.status)) return false;
  if (!date) return true;
  if (!item.billingEffectiveFrom || item.billingEffectiveFrom > date) return false;
  return item.billingEffectiveUntil == null || date < item.billingEffectiveUntil;
}

/** Status label that also surfaces a scheduled or elapsed billing end, which `status` alone hides. */
export function serviceStatusLabel(item: ItemBillingWindow, now = new Date()): { label: string; tone: "normal" | "warning" } {
  const base = item.status.replaceAll("_", " ");
  const until = item.billingEffectiveUntil;
  if (!until || ["ended", "canceled"].includes(item.status)) return { label: base, tone: "normal" };
  const day = (value: Date) => value.toISOString().slice(0, 10);
  if (day(until) <= day(now)) return { label: `Billing ended ${displayDate(until)}`, tone: "warning" };
  return { label: `${base} · ends ${displayDate(until)}`, tone: "warning" };
}

export const warningPillClass = "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200";
export const statusPillClass = "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
export const cardClass = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
