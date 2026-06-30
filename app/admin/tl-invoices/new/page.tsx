import Link from "next/link";

import { InvoiceGeneratorForm, type InvoiceCustomerOption } from "@/components/admin/invoice-generator-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { prisma } from "@/lib/db";

export default async function NewTlInvoicePage() {
  const customers = await prisma.customer.findMany({
    where: activeCustomerWhere,
    orderBy: [{ company: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  });

  const customerOptions: InvoiceCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    email: c.email?.trim() || null,
    billToLines: customerBillToLines(c),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/tl-invoices"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← TL invoices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">New invoice</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Build a one-off invoice for cash, cheque, or bank payers. A TL-INV number is assigned when you mark it sent or email it.
        </p>
      </div>

      <InvoiceGeneratorForm customers={customerOptions} />
    </div>
  );
}
