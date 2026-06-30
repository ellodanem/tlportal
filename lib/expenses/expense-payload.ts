import "server-only";

import type { ExpensePaymentMethod } from "@prisma/client";

export type ExpenseRequestPayload = {
  vendor: string;
  description: string | null;
  amount: number;
  currency: string;
  expenseDate: string;
  method: ExpensePaymentMethod;
  reference: string | null;
  notes: string | null;
  categoryId: string | null;
  customerId: string | null;
  deviceId: string | null;
};

const ALLOWED_METHODS = new Set<ExpensePaymentMethod>([
  "cash",
  "bank_transfer",
  "card",
  "cheque",
  "other",
]);

function parseYmd(raw: string, field: string): Date | { error: string } {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { error: `${field} must be YYYY-MM-DD.` };
  }
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    return { error: `${field} is not a valid date.` };
  }
  return d;
}

export function parseExpenseRequestBody(body: unknown): { payload: ExpenseRequestPayload } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Expense data is invalid." };
  const b = body as Record<string, unknown>;

  const vendor = String(b.vendor ?? "").trim();
  if (!vendor) return { error: "Vendor is required." };

  const amount = Number(b.amount ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount greater than zero." };

  const expenseDateParsed = parseYmd(String(b.expenseDate ?? ""), "Expense date");
  if ("error" in expenseDateParsed) return expenseDateParsed;

  const method = String(b.method ?? "card").trim() as ExpensePaymentMethod;
  if (!ALLOWED_METHODS.has(method)) return { error: "Invalid payment method." };

  const categoryIdRaw = String(b.categoryId ?? "").trim();
  const customerIdRaw = String(b.customerId ?? "").trim();
  const deviceIdRaw = String(b.deviceId ?? "").trim();
  const descriptionRaw = String(b.description ?? "").trim();
  const referenceRaw = String(b.reference ?? "").trim();
  const notesRaw = String(b.notes ?? "").trim();
  const currency = (String(b.currency ?? "XCD").trim() || "XCD").slice(0, 8).toUpperCase();

  return {
    payload: {
      vendor: vendor.slice(0, 200),
      description: descriptionRaw ? descriptionRaw.slice(0, 500) : null,
      amount,
      currency,
      expenseDate: String(b.expenseDate).trim(),
      method,
      reference: referenceRaw ? referenceRaw.slice(0, 120) : null,
      notes: notesRaw ? notesRaw.slice(0, 2000) : null,
      categoryId: categoryIdRaw || null,
      customerId: customerIdRaw || null,
      deviceId: deviceIdRaw || null,
    },
  };
}
