import "server-only";

import { clampInvoilessListLimit, InvoilessConfigError, invoilessJson } from "./client";

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
  /** Bill-to / customer email from list payload when present (fallback matching in TL) */
  billToEmail: string | null;
  billToPhone: string | null;
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
  const docsTop = o.docs;
  if (Array.isArray(docsTop)) return docsTop;
  for (const k of ["invoices", "data", "items", "results", "content"] as const) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      for (const ik of ["docs", "invoices", "items", "records", "results"] as const) {
        const arr = inner[ik];
        if (Array.isArray(arr)) return arr;
      }
    }
  }
  return [];
}

function extractPagination(body: unknown, page: number, limit: number): InvoilessInvoicesPageResult["pagination"] {
  if (!body || typeof body !== "object") {
    return { page, limit, totalPages: 1, totalItems: 0 };
  }
  const o = body as Record<string, unknown>;
  const data = o.data;
  const nested = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

  const fromMetaBlock = (raw: unknown): InvoilessInvoicesPageResult["pagination"] | null => {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    return {
      page: num(p.currentPage ?? p.page ?? page, page),
      limit: num(p.limit ?? p.pageSize ?? limit, limit),
      totalPages: Math.max(1, num(p.totalPages ?? p.pages ?? 1, 1)),
      totalItems: num(p.totalItems ?? p.total ?? 0, 0),
    };
  };

  const metaParsed =
    fromMetaBlock(nested?.pagination) ??
    fromMetaBlock(nested?.meta) ??
    fromMetaBlock(o.pagination) ??
    fromMetaBlock(o.meta);
  if (metaParsed) {
    return metaParsed;
  }

  /** Mongoose-style: `docs`, `page`, `pages`, `total` (and optional `limit`) on the same object. */
  const flat = (nested ?? o) as Record<string, unknown>;
  const hasDocs = Array.isArray(flat.docs);
  const totalItems = num(flat.total ?? flat.totalItems ?? 0, 0);
  if (hasDocs || totalItems > 0) {
    return {
      page: num(flat.page ?? flat.currentPage ?? page, page),
      limit: num(flat.limit ?? limit, limit),
      totalPages: Math.max(1, num(flat.pages ?? flat.totalPages ?? 1, 1)),
      totalItems,
    };
  }

  return { page, limit, totalPages: 1, totalItems: 0 };
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
  const id = pickString(c.id) ?? pickString(c._id) ?? pickString(c.internalId);
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

function pickBillToEmailFromRow(r: Record<string, unknown>): string | null {
  const bt = r.billTo;
  if (bt && typeof bt === "object") {
    const e = pickString((bt as Record<string, unknown>).email);
    if (e) return e;
  }
  const cust = r.customer;
  if (cust && typeof cust === "object") {
    const c = cust as Record<string, unknown>;
    const direct = pickString(c.email);
    if (direct) return direct;
    const nestedBt = c.billTo;
    if (nestedBt && typeof nestedBt === "object") {
      const e = pickString((nestedBt as Record<string, unknown>).email);
      if (e) return e;
    }
  }
  return null;
}

function pickBillToPhoneFromRow(r: Record<string, unknown>): string | null {
  const bt = r.billTo;
  if (bt && typeof bt === "object") {
    const p = pickString((bt as Record<string, unknown>).phone);
    if (p) return p;
  }
  const cust = r.customer;
  if (cust && typeof cust === "object") {
    const c = cust as Record<string, unknown>;
    const direct = pickString(c.phone);
    if (direct) return direct;
    const nestedBt = c.billTo;
    if (nestedBt && typeof nestedBt === "object") {
      const p = pickString((nestedBt as Record<string, unknown>).phone);
      if (p) return p;
    }
  }
  return null;
}

/** Digits-only key for loose phone comparison (list payloads vary). */
function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = raw.replace(/\D/g, "");
  return d.length >= 7 ? d : null;
}

async function fetchInvoilessCustomerContactHints(customerId: string): Promise<{ emails: string[]; phones: string[] }> {
  const out = { emails: [] as string[], phones: [] as string[] };
  const id = customerId.trim();
  if (!id) return out;
  try {
    const body = await invoilessJson<unknown>(`/customers/${encodeURIComponent(id)}`);
    let root: Record<string, unknown> | null = null;
    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      const data = o.data;
      root = data && typeof data === "object" ? (data as Record<string, unknown>) : o;
    }
    if (!root) return out;
    const bt = root.billTo;
    if (bt && typeof bt === "object") {
      const b = bt as Record<string, unknown>;
      const e = pickString(b.email);
      const p = pickString(b.phone);
      if (e) out.emails.push(e);
      if (p) out.phones.push(p);
    }
  } catch {
    // Missing customer or API error — continue with TL-side hints only
  }
  return out;
}

function normalizeInvoiceRow(row: unknown): InvoilessInvoiceListRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = pickString(r.id) ?? pickString(r._id);
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

  const { label: nestedLabel, invoilessId: nestedCustomerId } = customerLabelFromUnknown(r.customer);
  const customerIdOnRow = pickString(r.customerId) ?? pickString(r.customer_id);
  const customerInvoilessId = nestedCustomerId ?? customerIdOnRow;

  let customerLabel = nestedLabel;
  if (!customerLabel && r.billTo && typeof r.billTo === "object") {
    const b = r.billTo as Record<string, unknown>;
    const company = pickString(b.company);
    const fn = pickString(b.firstName);
    const ln = pickString(b.lastName);
    const person = [fn, ln].filter(Boolean).join(" ").trim();
    customerLabel = company ?? (person || pickString(b.email)) ?? null;
  }

  let previewUrl = pickString(r.url) ?? pickString(r.previewUrl) ?? pickString(r.publicUrl);
  if (!previewUrl) {
    previewUrl = `${INVOILESS_INVOICE_PREVIEW_ORIGIN}/i/${encodeURIComponent(id)}`;
  }

  const billToEmail = pickBillToEmailFromRow(r);
  const billToPhone = pickBillToPhoneFromRow(r);

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
    billToEmail,
    billToPhone,
    previewUrl,
  };
}

function sortInvoiceRowsDesc(rows: InvoilessInvoiceListRow[]): InvoilessInvoiceListRow[] {
  return [...rows].sort((a, b) => {
    const da = a.dateIssued ? new Date(a.dateIssued).getTime() : 0;
    const db = b.dateIssued ? new Date(b.dateIssued).getTime() : 0;
    return db - da;
  });
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
  const limit = clampInvoilessListLimit(params.limit ?? 50, 50, 100);
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

export type FetchInvoicesForInvoilessCustomerOptions = {
  maxInvoices?: number;
  /**
   * Invoiless list API has no customer-id filter; we call GET /invoices?search=… with these hints
   * (plus the Invoiless customer id) and keep rows whose parsed customer id matches.
   */
  searchHints?: string[];
  /**
   * Normalized (lowercase) emails for this TL customer. Rows whose bill-to email matches are kept even when
   * Invoiless attached a different customer id (common if the invoice was not created from the synced customer).
   */
  matchEmails?: string[];
  /** Bill-to phones for this TL customer (digits matched loosely). */
  matchPhones?: string[];
  /** Max pages to walk per search term (limit 100 per request). */
  maxPagesPerSearchTerm?: number;
  /** If search pulls are sparse, scan recent workspace pages without a search term. */
  fallbackScanMaxPages?: number;
  /** @deprecated Prefer fallbackScanMaxPages. Pages to scan when falling back without search. */
  maxPages?: number;
};

/**
 * Pull invoices for one Invoiless customer: search-driven (name / email / id) plus optional
 * fallback scan of recent pages. Rows match by linked Invoiless customer id and/or bill-to email and phone.
 */
export async function fetchInvoicesForInvoilessCustomerId(
  invoilessCustomerId: string,
  options: FetchInvoicesForInvoilessCustomerOptions = {},
): Promise<InvoilessInvoiceListRow[]> {
  const maxInvoices = options.maxInvoices ?? 12;
  const maxPagesPerSearchTerm = options.maxPagesPerSearchTerm ?? 5;
  const fallbackScanMaxPages = options.fallbackScanMaxPages ?? options.maxPages ?? 6;
  const searchHints = options.searchHints ?? [];
  const matchEmails = new Set(
    (options.matchEmails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
  const matchPhones = new Set(
    (options.matchPhones ?? [])
      .map((p) => normalizePhoneDigits(p))
      .filter((p): p is string => Boolean(p)),
  );

  const target = invoilessCustomerId.trim();
  if (!target) return [];

  const remote = await fetchInvoilessCustomerContactHints(target);
  for (const e of remote.emails) {
    const x = e.trim().toLowerCase();
    if (x) matchEmails.add(x);
  }
  for (const p of remote.phones) {
    const x = normalizePhoneDigits(p);
    if (x) matchPhones.add(x);
  }

  const termSet = new Set<string>([target, ...searchHints.map((s) => s.trim()).filter(Boolean)]);
  const searchTerms = [...termSet];

  const seen = new Set<string>();
  const out: InvoilessInvoiceListRow[] = [];

  function rowMatches(row: InvoilessInvoiceListRow): boolean {
    if (row.customerInvoilessId === target) return true;
    const em = row.billToEmail?.trim().toLowerCase();
    if (em && matchEmails.has(em)) return true;
    const ph = normalizePhoneDigits(row.billToPhone);
    return Boolean(ph && matchPhones.has(ph));
  }

  function collect(rows: InvoilessInvoiceListRow[]) {
    for (const row of rows) {
      if (!seen.has(row.id) && rowMatches(row)) {
        seen.add(row.id);
        out.push(row);
        if (out.length >= maxInvoices) return;
      }
    }
  }

  for (const term of searchTerms) {
    if (out.length >= maxInvoices) break;
    for (let p = 1; p <= maxPagesPerSearchTerm && out.length < maxInvoices; p++) {
      let result: InvoilessInvoicesPageResult;
      try {
        result = await fetchInvoicesPage({ page: p, limit: 100, search: term });
      } catch (e) {
        if (e instanceof InvoilessConfigError) return sortInvoiceRowsDesc(out).slice(0, maxInvoices);
        throw e;
      }
      collect(result.rows);
      if (p >= result.pagination.totalPages) break;
    }
  }

  if (out.length < maxInvoices) {
    for (let p = 1; p <= fallbackScanMaxPages && out.length < maxInvoices; p++) {
      let result: InvoilessInvoicesPageResult;
      try {
        result = await fetchInvoicesPage({ page: p, limit: 50 });
      } catch (e) {
        if (e instanceof InvoilessConfigError) break;
        throw e;
      }
      collect(result.rows);
      if (p >= result.pagination.totalPages) break;
    }
  }

  return sortInvoiceRowsDesc(out).slice(0, maxInvoices);
}
