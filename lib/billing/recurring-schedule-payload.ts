import "server-only";

import type { RecurringScheduleStatus } from "@prisma/client";

import type { NativeInvoicePdfLine } from "@/lib/billing/native-invoice-pdf";

export type RecurringScheduleRequestPayload = {
  name: string | null;
  customerId: string | null;
  billToLines: string[] | null;
  currency: string;
  notes: string | null;
  paymentInstructions: string | null;
  intervalMonths: number;
  nextIssueDate: string;
  dueDaysAfterIssue: number;
  autoEmail: boolean;
  emailTo: string | null;
  serviceAssignmentId: string | null;
  lineItems: NativeInvoicePdfLine[];
};

const ALLOWED_INTERVALS = new Set([1, 3, 6, 12]);

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

export function parseRecurringScheduleRequestBody(
  body: unknown,
): { payload: RecurringScheduleRequestPayload } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Request body must be JSON." };
  const b = body as Record<string, unknown>;

  const nextIssueParsed = parseYmd(String(b.nextIssueDate ?? ""), "Next issue date");
  if ("error" in nextIssueParsed) return nextIssueParsed;

  const lineParsed = parseLineItems(b.lineItems);
  if ("error" in lineParsed) return lineParsed;

  const intervalMonths = Number(b.intervalMonths ?? 1);
  if (!ALLOWED_INTERVALS.has(intervalMonths)) {
    return { error: "Interval must be 1, 3, 6, or 12 months." };
  }

  const dueDaysAfterIssue = Number(b.dueDaysAfterIssue ?? 30);
  if (!Number.isFinite(dueDaysAfterIssue) || dueDaysAfterIssue < 0 || dueDaysAfterIssue > 365) {
    return { error: "Due days must be between 0 and 365." };
  }

  const customerIdRaw = String(b.customerId ?? "").trim();
  let billToLines: string[] | null = null;
  if (Array.isArray(b.billToLines)) {
    const lines = b.billToLines.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (lines.length) billToLines = lines;
  }
  if (!customerIdRaw && !billToLines?.length) {
    return { error: "Choose a customer or enter a bill-to name." };
  }

  const nameRaw = String(b.name ?? "").trim();
  const notesRaw = String(b.notes ?? "").trim();
  const paymentRaw = String(b.paymentInstructions ?? "").trim();
  const emailRaw = String(b.emailTo ?? "").trim();
  const serviceAssignmentIdRaw = String(b.serviceAssignmentId ?? "").trim();
  const currency = (String(b.currency ?? "XCD").trim() || "XCD").slice(0, 8).toUpperCase();
  const autoEmail = b.autoEmail !== false && b.autoEmail !== "false";

  return {
    payload: {
      name: nameRaw.length ? nameRaw.slice(0, 200) : null,
      customerId: customerIdRaw.length ? customerIdRaw : null,
      billToLines,
      currency,
      notes: notesRaw.length ? notesRaw.slice(0, 2000) : null,
      paymentInstructions: paymentRaw.length ? paymentRaw.slice(0, 2000) : null,
      intervalMonths,
      nextIssueDate: String(b.nextIssueDate).trim(),
      dueDaysAfterIssue: Math.round(dueDaysAfterIssue),
      autoEmail,
      emailTo: emailRaw.length ? emailRaw : null,
      serviceAssignmentId: serviceAssignmentIdRaw.length ? serviceAssignmentIdRaw : null,
      lineItems: lineParsed.items,
    },
  };
}

export function recurringScheduleStatusLabel(status: RecurringScheduleStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "ended":
      return "Ended";
    default:
      return status;
  }
}
