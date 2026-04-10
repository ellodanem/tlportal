import "server-only";

import { InvoilessConfigError, invoilessJson } from "./client";

/** Public preview host from create-invoice response; override if Invoiless changes regions. */
export const INVOILESS_INVOICE_PREVIEW_ORIGIN = "https://invoiless.com";

export type InvoilessInvoiceListRow = {
  id: string;
  number: string | null;
  status: string | null;
  /** ISO date string or display fallback */
  dateIssued: string | null;
  dueDate: string | null;
  currency: string | null;
  total: number | null;
  /** Resolved from customer object or id */
  customerLabel: string | null;
  /** Invoiless customer id when present (for TL Portal matching) */
  customerInvoilessId: string | null;
  previewUrl: string | null;
};

export type InvoilessInvoicesPageResult = {
  rows: InvoilessInvoiceListRow[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
};

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function extractInvoicesArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  for (const k of ["invoices", "data", "items", "results", "content"] as const) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function extractPagination(body: unknown, page: number, limit: number): InvoilessInvoicesPageResult["pagination"] {
  if (!body || typeof body !== "object") {
    return { page, limit, totalPages: 1, totalItems: 0 };
  }
  const o = body as Record<string, unknown>;
  const raw = o.pagination ?? o.meta;
  if (!raw || typeof raw !== "object") {
    return { page, limit, totalPages: 1, totalItems: 0 };
  }
  const p = raw as Record<string, unknown>;
  return {
    page: num(p.currentPage ?? p.page ?? page, page),
    limit: num(p.limit ?? p.pageSize ?? limit, limit),
    totalPages: Math.max(1, num(p.totalPages ?? p.pages ?? 1, 1)),
    totalItems: num(p.totalItems ?? p.total ?? 0, 0),
  };
}

function pickString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function customerLabelFromUnknown(customer: unknown): { label: string | null; invoilessId: string | null } {
  if (customer == null) return { label: null, invoilessId: null };
  if (typeof customer === "string" && customer.trim()) {
    return { label: null, invoilessId: customer.trim() };
  }
  if (typeof customer !== "object") return { label: null, invoilessId: null };
  const c = customer as Record<string, unknown>;
  const id = pickString(c.id) ?? pickString(c.internalId);
  const billTo = c.billTo;
  if (billTo && typeof billTo === "object") {
    const b = billTo as Record<string, unknown>;
    const company = pickString(b.company);
    if (company) return { label: company, invoilessId: id };
    const fn = pickString(b.firstName);
    const ln = pickString(b.lastName);
    const person = [fn, ln].filter(Boolean).join(" ").trim();
    if (person) return { label: person, invoilessId: id };
 }
  const company = pickString(c.company);
  if (company) return { label: company, invoilessId: id };
  const email = pickString(c.email);
  if (email) return { label: email, invoilessId: id };
  return { label: id, invoilessId: id };
}

function normalizeInvoiceRow(row: unknown): InvoilessInvoiceListRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = pickString(r.id);
  if (!id) return null;

  const number =
    pickString(r.number) ?? pickString(r.invoiceNumber) ?? pickString(r.invoice_number) ?? null;
  const status = pickString(r.status) ?? null;
  const dateIssued =
    pickString(r.date) ??
    pickString(r.dateIssued) ??
    pickString(r.issuedAt) ??
    pickString(r.createdAt) ??
    pickString(r.created_at) ??
    null;
  const dueDate =
    pickString(r.dueDate) ?? pickString(r.due_date) ?? pickString(r.due) ?? null;
  const currency = pickString(r.currency) ?? null;

  const total =
    pickNumber(r.total) ??
    pickNumber(r.amount) ??
    pickNumber(r.totalAmount) ??
    pickNumber(r.grandTotal) ??
    pickNumber(r.grand_total) ??
    null;

  const { label: customerLabel, invoilessId: customerInvoilessId } = customerLabelFromUnknown(r.customer);

  let previewUrl = pickString(r.url) ?? pickString(r.previewUrl) ?? pickString(r.publicUrl);
  if (!previewUrl) {
    previewUrl = `${INVOILESS_INVOICE_PREVIEW_ORIGIN}/i/${encodeURIComponent(id)}`;
  }

  return {
    id,
    number,
    status,
    dateIssued,
    dueDate,
    currency,
    total,
    customerLabel,
    customerInvoilessId,
    previewUrl,
  };
}

export type FetchInvoicesPageParams = {
  page?: number;
  limit?: number;
  search?: string;
};

/**
 * GET /v1/invoices — paginated list (Invoiless Management API).
 */
export async function fetchInvoicesPage(params: FetchInvoicesPageParams = {}): Promise<InvoilessInvoicesPageResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  const search = params.search?.trim();
  if (search) qs.set("search", search);

  const path = `/invoices?${qs.toString()}`;
  const body = await invoilessJson<unknown>(path);
  const rawRows = extractInvoicesArray(body);
  const rows = rawRows.map(normalizeInvoiceRow).filter((x): x is InvoilessInvoiceListRow => x != null);
  const pagination = extractPagination(body, page, limit);

  if (pagination.totalItems === 0 && rows.length > 0) {
    pagination.totalItems = rows.length;
  }

  return { rows, pagination };
}

export function isInvoilessConfigured(): boolean {
  return Boolean(process.env.INVOILESS_API_KEY?.trim());
}

/**
 * Best-effort: load recent pages and keep invoices for one Invoiless customer id.
 * Bounded API usage for customer detail sidebar.
 */
export async function fetchInvoicesForInvoilessCustomerId(
  invoilessCustomerId: string,
  options: { maxInvoices?: number; maxPages?: number } = {},
): Promise<InvoilessInvoiceListRow[]> {
  const maxInvoices = options.maxInvoices ?? 12;
  const maxPages = options.maxPages ?? 4;
  const target = invoilessCustomerId.trim();
  if (!target) return [];

  const seen = new Set<string>();
  const out: InvoilessInvoiceListRow[] = [];

  for (let p = 1; p <= maxPages && out.length < maxInvoices; p++) {
    let result: InvoilessInvoicesPageResult;
    try {
      result = await fetchInvoicesPage({ page: p, limit: 50 });
    } catch (e) {
      if (e instanceof InvoilessConfigError) return out;
      throw e;
    }

    for (const row of result.rows) {
      if (row.customerInvoilessId === target && !seen.has(row.id)) {
        seen.add(row.id);
        out.push(row);
        if (out.length >= maxInvoices) break;
      }
    }

    if (p >= result.pagination.totalPages) break;
  }

  return out;
}
