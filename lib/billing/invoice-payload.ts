import "server-only";

import type { NativeInvoicePdfLine } from "./native-invoice-pdf";

export type InvoiceRequestPayload = {
  customerId: string | null;
  billToLines: string[] | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  notes: string | null;
  paymentInstructions: string | null;
  allowOnlinePayment: boolean;
  discountAmount: number;
  lineItems: NativeInvoicePdfLine[];
};

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

function parseLineItems(raw: unknown): { items: NativeInvoicePdfLine[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Line items must be an array." };
  const items: NativeInvoicePdfLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") return { error: `Line item ${i + 1} is invalid.` };
    const r = row as Record<string, unknown>;
    const description = String(r.description ?? "").trim();
    if (!description) return { error: `Line item ${i + 1} needs a description.` };
    const quantity = Number(r.quantity ?? 1);
    const unitPrice = Number(r.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Line item ${i + 1}: quantity must be greater than zero.` };
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: `Line item ${i + 1}: unit price must be zero or greater.` };
    }
    items.push({ description, quantity, unitPrice });
  }
  if (!items.length) return { error: "Add at least one line item." };
  return { items };
}

export function parseInvoiceRequestBody(body: unknown): { payload: InvoiceRequestPayload } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Request body must be JSON." };
  const b = body as Record<string, unknown>;

  const issueDateParsed = parseYmd(String(b.issueDate ?? ""), "Invoice date");
  if ("error" in issueDateParsed) return issueDateParsed;

  const dueRaw = String(b.dueDate ?? "").trim();
  if (dueRaw) {
    const dueDateParsed = parseYmd(dueRaw, "Due date");
    if ("error" in dueDateParsed) return dueDateParsed;
  }

  const lineParsed = parseLineItems(b.lineItems);
  if ("error" in lineParsed) return lineParsed;

  const customerIdRaw = String(b.customerId ?? "").trim();
  let billToLines: string[] | null = null;
  if (Array.isArray(b.billToLines)) {
    const lines = b.billToLines.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (lines.length) billToLines = lines;
  }

  const notesRaw = String(b.notes ?? "").trim();
  const paymentRaw = String(b.paymentInstructions ?? "").trim();
  const currency = (String(b.currency ?? "XCD").trim() || "XCD").slice(0, 8).toUpperCase();
  const allowOnlinePayment = b.allowOnlinePayment === true;
  const discountRaw = Number(b.discountAmount ?? 0);
  const discountAmount = Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0;

  return {
    payload: {
      customerId: customerIdRaw.length ? customerIdRaw : null,
      billToLines,
      issueDate: String(b.issueDate).trim(),
      dueDate: dueRaw || null,
      currency,
      notes: notesRaw.length ? notesRaw.slice(0, 2000) : null,
      paymentInstructions: paymentRaw.length ? paymentRaw.slice(0, 2000) : null,
      allowOnlinePayment,
      discountAmount,
      lineItems: lineParsed.items,
    },
  };
}
