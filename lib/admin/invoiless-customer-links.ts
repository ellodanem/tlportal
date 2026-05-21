import "server-only";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";
import { getInvoilessExternalCustomerId } from "@/lib/services/billing-service";

export type TlCustomerLink = { portalId: string; name: string };

export type InvoilessLinkedCustomer = {
  portalId: string;
  name: string;
  email: string | null;
  invoilessCustomerId: string;
};

/**
 * Resolve Invoiless ↔ TL customer maps for Admin → Invoices (BillingAccount + legacy column).
 */
export async function loadInvoilessCustomerLinks(): Promise<{
  tlCustomerByInvoilessId: Record<string, TlCustomerLink>;
  tlCustomerByEmail: Record<string, TlCustomerLink>;
  linkedCustomers: InvoilessLinkedCustomer[];
}> {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      invoilessCustomerId: true,
      billingAccounts: {
        where: { provider: "invoiless" },
        select: { externalCustomerId: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const tlCustomerByInvoilessId: Record<string, TlCustomerLink> = {};
  const tlCustomerByEmail: Record<string, TlCustomerLink> = {};
  const linkedCustomers: InvoilessLinkedCustomer[] = [];

  for (const c of customers) {
    const invoilessCustomerId =
      c.billingAccounts[0]?.externalCustomerId?.trim() || c.invoilessCustomerId?.trim() || null;
    if (!invoilessCustomerId) continue;

    const name = customerDisplayName(c);
    const link = { portalId: c.id, name };
    tlCustomerByInvoilessId[invoilessCustomerId] = link;
    linkedCustomers.push({
      portalId: c.id,
      name,
      email: c.email,
      invoilessCustomerId,
    });

    const em = c.email?.trim().toLowerCase();
    if (em) {
      tlCustomerByEmail[em] = link;
    }
  }

  linkedCustomers.sort((a, b) => a.name.localeCompare(b.name));

  return { tlCustomerByInvoilessId, tlCustomerByEmail, linkedCustomers };
}

/** Resolve Invoiless id for a TL customer (BillingAccount preferred). */
export async function resolveInvoilessIdForCustomer(customerId: string): Promise<string | null> {
  return getInvoilessExternalCustomerId(customerId);
}
