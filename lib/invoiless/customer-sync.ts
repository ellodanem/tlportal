import type { Customer } from "@prisma/client";

import { invoilessFetch } from "./client";

export type BillTo = {
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  legal?: string;
};

const ADDRESS_MAX = 500;
const LEGAL_MAX = 100;
const NOTES_MAX = 1000;
const TAG_MAX_LEN = 50;
const TAG_MAX_COUNT = 10;
const CC_MAX = 3;

/**
 * Compose a single billTo.address string for Invoiless (max 500 chars), matching typical
 * street + city + state + postal + country layouts from their UI.
 */
export function buildInvoilessBillToAddress(
  c: Pick<Customer, "address" | "city" | "state" | "postalCode" | "country">,
): string | undefined {
  const street = c.address?.trim();
  const city = c.city?.trim();
  const state = c.state?.trim();
  const postal = c.postalCode?.trim();
  const country = c.country?.trim();

  const segments: string[] = [];
  if (street) {
    segments.push(street);
  }
  const cityLine = [city, state].filter(Boolean).join(", ");
  if (cityLine) {
    segments.push(cityLine);
  }
  if (postal) {
    segments.push(postal);
  }
  if (country) {
    segments.push(country);
  }

  const joined = segments.join(", ").trim();
  if (!joined) {
    return undefined;
  }
  return joined.length > ADDRESS_MAX ? joined.slice(0, ADDRESS_MAX) : joined;
}

function normalizeInvoilessTags(tags: string[]): string[] | undefined {
  if (!tags.length) {
    return undefined;
  }
  const out = tags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.length > TAG_MAX_LEN ? t.slice(0, TAG_MAX_LEN) : t))
    .slice(0, TAG_MAX_COUNT);
  return out.length ? out : undefined;
}

function normalizeNotes(notes: string | null): string | undefined {
  const n = notes?.trim();
  if (!n) {
    return undefined;
  }
  return n.length > NOTES_MAX ? n.slice(0, NOTES_MAX) : n;
}

/** Cc/Bcc: comma-separated, max 3, unique, must not duplicate primary billing email (Invoiless rules). */
function parseCcBccList(raw: string | null | undefined, primaryEmail: string | null | undefined): string[] | undefined {
  const primary = primaryEmail?.trim().toLowerCase();
  if (!raw?.trim()) {
    return undefined;
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of parts) {
    if (e === primary || seen.has(e)) {
      continue;
    }
    seen.add(e);
    out.push(e);
    if (out.length >= CC_MAX) {
      break;
    }
  }
  return out.length ? out : undefined;
}

/**
 * Invoiless requires either (firstName + lastName) or company on billTo.
 */
export function customerToBillTo(
  c: Pick<Customer, "firstName" | "lastName" | "company" | "email" | "phone" | "legalInfo" | "address" | "city" | "state" | "postalCode" | "country">,
): BillTo {
  const company = c.company?.trim();
  const firstName = c.firstName?.trim();
  const lastName = c.lastName?.trim();
  const composedAddress = buildInvoilessBillToAddress(c);
  const legalRaw = c.legalInfo?.trim();
  const legal =
    legalRaw && legalRaw.length > LEGAL_MAX ? legalRaw.slice(0, LEGAL_MAX) : legalRaw || undefined;

  if (company) {
    return {
      company,
      email: c.email?.trim().toLowerCase() || undefined,
      phone: c.phone?.trim() || undefined,
      address: composedAddress,
      legal,
    };
  }
  if (firstName && lastName) {
    return {
      firstName,
      lastName,
      email: c.email?.trim().toLowerCase() || undefined,
      phone: c.phone?.trim() || undefined,
      address: composedAddress,
      legal,
    };
  }
  throw new Error("Customer needs a company name or both first and last name for Invoiless billing.");
}

function defaultCurrency(): string {
  return process.env.INVOILESS_DEFAULT_CURRENCY?.trim() || "XCD";
}

function customerSyncBody(c: Customer): Record<string, unknown> {
  const billTo = customerToBillTo(c);
  const cc = parseCcBccList(c.invoiceCc, c.email);
  const bcc = parseCcBccList(c.invoiceBcc, c.email);
  const notes = normalizeNotes(c.notes);
  const tags = normalizeInvoilessTags(c.tags ?? []);

  const body: Record<string, unknown> = {
    billTo,
    currency: defaultCurrency(),
    lang: "en",
  };
  if (cc) {
    body.cc = cc;
  }
  if (bcc) {
    body.bcc = bcc;
  }
  if (notes) {
    body.notes = notes;
  }
  if (tags) {
    body.tags = tags;
  }
  return body;
}

export async function createInvoilessCustomer(c: Customer): Promise<{ id: string }> {
  const res = await invoilessFetch("/customers", {
    method: "POST",
    body: JSON.stringify(customerSyncBody(c)),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      `Invoiless create customer ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  const id = extractCustomerId(body);
  if (!id) {
    throw new Error(
      `Invoiless did not return a customer id. Raw: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return { id };
}

function extractCustomerId(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const o = body as Record<string, unknown>;
  if (typeof o.id === "string") {
    return o.id;
  }
  const data = o.data;
  if (data && typeof data === "object" && data !== null) {
    const id = (data as Record<string, unknown>).id;
    if (typeof id === "string") {
      return id;
    }
  }
  return null;
}

export async function updateInvoilessCustomer(c: Customer): Promise<void> {
  if (!c.invoilessCustomerId) {
    throw new Error("No Invoiless customer id on record.");
  }
  const res = await invoilessFetch(`/customers/${c.invoilessCustomerId}`, {
    method: "PATCH",
    body: JSON.stringify(customerSyncBody(c)),
  });
  const text = await res.text();
  if (!res.ok) {
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : text;
    } catch {
      // keep text
    }
    throw new Error(
      `Invoiless update customer ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
}
