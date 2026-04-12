import Link from "next/link";

import { CustomersTable, customersTableTitle } from "@/components/admin/customers-table";
import { buildCustomerTableRows } from "@/lib/admin/customer-table-rows";
import { prisma } from "@/lib/db";

export default async function CustomersPage() {
  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());

  const customers = await prisma.customer.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      invoilessCustomerId: true,
      tags: true,
      updatedAt: true,
      serviceAssignments: {
        where: { endDate: null, status: { not: "cancelled" } },
        select: { status: true, endDate: true, nextDueDate: true, deviceId: true },
      },
    },
  });

  const rows = buildCustomerTableRows(customers);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{customersTableTitle(rows.length)}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Local records; use Sync on a customer when Invoiless is configured. Rows with a next due date sort to the
            top (soonest first).
          </p>
        </div>
        <Link
          href="/admin/customers/new"
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Add customer
        </Link>
      </div>

      <CustomersTable rows={rows} invoilessConfigured={invoilessConfigured} />
    </div>
  );
}
