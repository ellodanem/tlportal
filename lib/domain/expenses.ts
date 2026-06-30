import type { ExpensePaymentMethod } from "@prisma/client";

import { formatMoney } from "@/lib/domain/native-billing";

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export function formatExpenseAmount(amount: number, currency = "XCD"): string {
  return formatMoney(amount, currency);
}

export function monthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function parseYearMonth(raw: string | undefined): { year: number; month: number } {
  const now = new Date();
  const fallback = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  if (!raw?.trim()) return fallback;
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return fallback;
  return { year, month };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
