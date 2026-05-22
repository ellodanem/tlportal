import type { Customer } from "@prisma/client";

import { customerDisplayName } from "@/lib/admin/customer-display";

export function customerBillToLines(customer: Pick<
  Customer,
  | "company"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "postalCode"
  | "country"
>): string[] {
  const lines: string[] = [];
  const name = customerDisplayName(customer);
  lines.push(name);

  const person = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  if (customer.company?.trim() && person) {
    lines.push(`Attn: ${person}`);
  }

  const addrParts = [
    customer.address?.trim(),
    [customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ").trim() || null,
    customer.country?.trim(),
  ].filter(Boolean) as string[];

  for (const part of addrParts) {
    for (const line of part.split(/\r?\n/).filter(Boolean)) {
      lines.push(line);
    }
  }

  const contact = [customer.email?.trim(), customer.phone?.trim()].filter(Boolean);
  if (contact.length) {
    lines.push(contact.join(" · "));
  }

  return lines;
}
