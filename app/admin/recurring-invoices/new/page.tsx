import Link from "next/link";

import {
  RecurringScheduleForm,
  type RecurringCustomerOption,
} from "@/components/admin/recurring-schedule-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { prisma } from "@/lib/db";

export default async function NewRecurringInvoicePage() {
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

  const customerOptions: RecurringCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    email: c.email?.trim() || null,
    billToLines: customerBillToLines(c),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/recurring-invoices"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Recurring invoices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          New recurring schedule
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Define line items and billing cadence. Invoices are generated automatically on the next issue date (or use
          Generate now on the detail page).
        </p>
      </div>

      <RecurringScheduleForm customers={customerOptions} />
    </div>
  );
}
