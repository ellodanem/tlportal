import "server-only";

import { InvoilessConfigError, invoilessFetch } from "./client";

function defaultCurrency(): string {
  return process.env.INVOILESS_DEFAULT_CURRENCY?.trim() || "XCD";
}

/** Today's calendar date as YYYY-MM-DD (UTC), for Invoiless `date` when creating from TL. */
function todayYmdUtc(): string {
  const n = new Date();
  const y = n.getUTCFullYear();
  const m = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Invoiless expects `date` and `dueDate` as calendar `YYYY-MM-DD`. Joi often compares `dueDate` to `date`
 * (`ref:date`); omitting `date` breaks that rule. Also normalize `<input type="date">` and locale strings.
 */
function userDateInputToYmd(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const d = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const month = parseInt(us[1], 10) - 1;
    const day = parseInt(us[2], 10);
    const y = parseInt(us[3], 10);
    const d = new Date(Date.UTC(y, month, day, 0, 0, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export type CreateInvoilessInvoiceItem = { name: string; quantity: number; price: number };

function uPickString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function uPickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function unwrapInvoilessRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const data = o.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return o;
}

function pickInvoiceCustomerId(customer: unknown): string | null {
  if (typeof customer === "string" && customer.trim()) return customer.trim();
  if (customer && typeof customer === "object") {
    const c = customer as Record<string, unknown>;
    return uPickString(c.id) ?? uPickString(c._id);
  }
  return null;
}

function extractItemsArray(root: Record<string, unknown>): unknown[] {
  for (const k of ["items", "lineItems", "lines"] as const) {
    const v = root[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeEditItems(raw: unknown[]): CreateInvoilessInvoiceItem[] {
  const out: CreateInvoilessInvoiceItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = uPickString(o.name) ?? uPickString(o.description) ?? uPickString(o.title) ?? "";
    const quantity = uPickNumber(o.quantity) ?? uPickNumber(o.qty) ?? 1;
    const price = uPickNumber(o.price) ?? uPickNumber(o.unitPrice) ?? uPickNumber(o.amount) ?? 0;
    if (!name) continue;
    out.push({ name: name.slice(0, 100), quantity, price });
  }
  return out;
}

function toDateInputValue(iso: unknown): string {
  const s = uPickString(iso);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export type InvoilessInvoiceScheduleKind = "standard" | "retainer";

export type InvoilessInvoiceForEdit = {
  id: string;
  /** Invoice number for display when present */
  number: string | null;
  invoilessCustomerId: string | null;
  items: CreateInvoilessInvoiceItem[];
  status: string;
  notes: string;
  /** Invoice issue date for `<input type="date">` and API `date` */
  invoiceDateInput: string;
  dueDateInput: string;
  isRetainer: boolean;
  isRecurring: boolean;
};

/**
 * GET /v1/invoices/:id — load invoice for the TL edit form.
 */
export async function fetchInvoilessInvoiceForEdit(invoiceId: string): Promise<InvoilessInvoiceForEdit> {
  const id = invoiceId.trim();
  if (!id) {
    throw new Error("Invoice id is required.");
  }
  const res = await invoilessFetch(`/invoices/${encodeURIComponent(id)}`);
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new Error(
      `Invoiless ${res.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
  const root = unwrapInvoilessRecord(parsed);
  if (!root) {
    throw new Error("Invoiless did not return a valid invoice.");
  }
  const invId = uPickString(root.id) ?? uPickString(root._id) ?? id;
  const number =
    uPickString(root.number) ?? uPickString(root.invoiceNumber) ?? uPickString(root.invoice_number) ?? null;
  const customerId = pickInvoiceCustomerId(root.customer);
  let items = normalizeEditItems(extractItemsArray(root));
  if (!items.length) {
    items = [{ name: "", quantity: 1, price: 0 }];
  }
  const status = uPickString(root.status) ?? "Draft";
  const notes = uPickString(root.notes) ?? "";
  const dateRaw = root.date ?? root.issueDate ?? root.dateIssued ?? root.issuedAt ?? root.invoiceDate;
  const invoiceDateInput = toDateInputValue(dateRaw) || todayYmdUtc();
  const dueRaw =
    root.dueDate ?? root.due_date ?? root.due ?? root.paymentDueDate ?? root.payment_due_date;
  const dueDateInput = toDateInputValue(dueRaw);
  const isRetainer = root.isRetainer === true || root.isRetainer === "true";
  const isRecurring =
    root.isRecurring === true ||
    root.isRecurring === "true" ||
    root.makeRecurring === true ||
    root.makeRecurring === "true";

  return {
    id: invId,
    number,
    invoilessCustomerId: customerId,
    items,
    status,
    notes,
    invoiceDateInput,
    dueDateInput,
    isRetainer,
    isRecurring,
  };
}

function mapItemsForApi(items: CreateInvoilessInvoiceItem[]) {
  return items.map((i) => {
    const name = i.name?.trim() ?? "";
    if (!name) {
      throw new Error("Each line item needs a name.");
    }
    const quantity = Number(i.quantity);
    const price = Number(i.price);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Each line item needs a quantity greater than zero.");
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("Each line item needs a valid unit price (0 or greater).");
    }
    return {
      name: name.slice(0, 100),
      quantity,
      price,
    };
  });
}

/**
 * PATCH /v1/invoices/:id — partial update (line items, status, notes, due date).
 * `isRetainer` / recurring flags are omitted: Invoiless returns 403 if `isRetainer` is sent after create.
 */
export async function updateInvoilessInvoiceApi(params: {
  invoiceId: string;
  /** Sent on PUT fallback so a full replace does not drop the customer link. */
  invoilessCustomerId?: string | null;
  items: CreateInvoilessInvoiceItem[];
  status?: string;
  notes?: string | null;
  /** Invoice issue date (YYYY-MM-DD from form); required for Joi `dueDate` vs `date` rules. */
  invoiceDate?: string | null;
  dueDate?: string | null;
}): Promise<void> {
  const invoiceId = params.invoiceId.trim();
  if (!invoiceId) {
    throw new Error("Invoice id is required.");
  }
  const items = mapItemsForApi(params.items);
  if (!items.length) {
    throw new Error("At least one line item is required.");
  }

  const issueYmd = userDateInputToYmd(params.invoiceDate) ?? todayYmdUtc();
  const dueYmd = userDateInputToYmd(params.dueDate);

  const body: Record<string, unknown> = {
    items,
    status: (params.status?.trim() || "Draft") as string,
    notes: params.notes != null ? params.notes.trim().slice(0, 1000) : "",
    date: issueYmd,
    dueDate: dueYmd,
  };

  const path = `/invoices/${encodeURIComponent(invoiceId)}`;

  let res = await invoilessFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  if (res.status === 405) {
    const cid = params.invoilessCustomerId?.trim();
    const putBody: Record<string, unknown> = {
      ...body,
      currency: defaultCurrency().slice(0, 8),
    };
    if (cid) {
      putBody.customer = cid;
    }
    res = await invoilessFetch(path, {
      method: "PUT",
      body: JSON.stringify(putBody),
    });
  }

  if (res.ok) {
    return;
  }
  const errText = await res.text();
  let errParsed: unknown = errText;
  try {
    errParsed = errText ? JSON.parse(errText) : errText;
  } catch {
    // keep text
  }
  throw new Error(
    `Invoiless ${res.status}: ${typeof errParsed === "string" ? errParsed : JSON.stringify(errParsed)}`,
  );
}

function parseCreateInvoiceResponse(body: unknown): { id: string; url: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Invoiless did not return a JSON invoice body.");
  }
  const o = body as Record<string, unknown>;
  const data = o.data;
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : o;
  const id = typeof root.id === "string" ? root.id : typeof o.id === "string" ? o.id : null;
  if (!id) {
    throw new Error("Invoiless did not return an invoice id.");
  }
  const urlRaw = typeof root.url === "string" ? root.url : typeof o.url === "string" ? o.url : null;
  const url = urlRaw ?? `https://invoiless.com/i/${encodeURIComponent(id)}`;
  return { id, url };
}

/**
 * POST /v1/invoices — create invoice with an existing Invoiless customer id (string form per API docs).
 *
 * Note: Public Invoiless docs only list `isRetainer` as a special type on this endpoint; recurring (“Make recurring”)
 * is not accepted here (`isRecurring` returns validation “not allowed”). Set up recurring in the Invoiless app instead.
 */
export async function createInvoilessInvoiceApi(params: {
  invoilessCustomerId: string;
  items: CreateInvoilessInvoiceItem[];
  status?: string;
  currency?: string;
  notes?: string | null;
  /** Invoice issue date; defaults to today (UTC) so `dueDate` validation can reference `date`. */
  invoiceDate?: string | null;
  dueDate?: string | null;
  /** Standard one-off invoice vs Invoiless retainer (`isRetainer`). */
  scheduleType?: InvoilessInvoiceScheduleKind;
}): Promise<{ id: string; url: string }> {
  const cid = params.invoilessCustomerId.trim();
  if (!cid) {
    throw new Error("Invoiless customer id is required.");
  }
  const items = mapItemsForApi(params.items);
  if (!items.length) {
    throw new Error("At least one line item is required.");
  }

  const issueYmd = userDateInputToYmd(params.invoiceDate) ?? todayYmdUtc();
  const dueYmd = userDateInputToYmd(params.dueDate);
  const schedule = params.scheduleType ?? "standard";

  const body: Record<string, unknown> = {
    customer: cid,
    items,
    currency: (params.currency?.trim() || defaultCurrency()).slice(0, 8),
    status: (params.status?.trim() || "Draft") as string,
    date: issueYmd,
  };
  if (params.notes?.trim()) {
    body.notes = params.notes.trim().slice(0, 1000);
  }

  if (schedule === "retainer") {
    body.isRetainer = true;
    if (dueYmd) {
      body.dueDate = dueYmd;
    }
  } else {
    if (dueYmd) {
      body.dueDate = dueYmd;
    }
  }

  const res = await invoilessFetch("/invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new Error(
      `Invoiless ${res.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
  return parseCreateInvoiceResponse(parsed);
}

export async function deleteInvoilessInvoiceApi(invoiceId: string): Promise<void> {
  const id = invoiceId.trim();
  if (!id) {
    throw new Error("Invoice id is required.");
  }
  const res = await invoilessFetch(`/invoices/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : text;
    } catch {
      // keep text
    }
    throw new Error(
      `Invoiless ${res.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
}

export function assertInvoilessConfigured(): void {
  if (!process.env.INVOILESS_API_KEY?.trim()) {
    throw new InvoilessConfigError();
  }
}
