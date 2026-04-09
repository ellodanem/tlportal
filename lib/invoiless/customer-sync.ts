import type { Customer } from "@prisma/client";

import { invoilessFetch } from "./client";

export type BillTo = {
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
};

/**
 * Invoiless requires either (firstName + lastName) or company on billTo.
 */
export function customerToBillTo(c: Pick<Customer, "firstName" | "lastName" | "company" | "email" | "phone" | "address">): BillTo {
  const company = c.company?.trim();
  const firstName = c.firstName?.trim();
  const lastName = c.lastName?.trim();
  if (company) {
    return {
      company,
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
      address: c.address?.trim() || undefined,
    };
  }
  if (firstName && lastName) {
    return {
      firstName,
      lastName,
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
      address: c.address?.trim() || undefined,
    };
  }
  throw new Error("Customer needs a company name or both first and last name for Invoiless billing.");
}

function defaultCurrency(): string {
  return process.env.INVOILESS_DEFAULT_CURRENCY?.trim() || "XCD";
}

export async function createInvoilessCustomer(c: Customer): Promise<{ id: string }> {
  const billTo = customerToBillTo(c);
  const res = await invoilessFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      billTo,
      currency: defaultCurrency(),
      lang: "en",
    }),
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
  const billTo = customerToBillTo(c);
  const res = await invoilessFetch(`/customers/${c.invoilessCustomerId}`, {
    method: "PATCH",
    body: JSON.stringify({
      billTo,
      currency: defaultCurrency(),
    }),
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
