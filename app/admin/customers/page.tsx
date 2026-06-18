import Link from "next/link";

import { CustomersTable, customersTableTitle } from "@/components/admin/customers-table";
import { buildCustomerTableRows } from "@/lib/admin/customer-table-rows";
import { activeCustomerWhere, archivedCustomerWhere } from "@/lib/admin/active-customer-filter";
import { prisma } from "@/lib/db";

type Props = { searchParams: Promise<{ view?: string }> };

export default async function CustomersPage({ searchParams }: Props) {
  const { view } = await searchParams;
  const showArchived = view === "archived";
  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());

  const customers = await prisma.customer.findMany({
    where: showArchived ? archivedCustomerWhere : activeCustomerWhere,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      invoilessCustomerId: true,
      billingMode: true,
      tags: true,
      updatedAt: true,
      archivedAt: true,
      billingAccounts: {
        select: { provider: true, externalCustomerId: true, status: true },
      },
      serviceAssignments: {
        where: { endDate: null, status: { not: "cancelled" } },
        select: {
          id: true,
          status: true,
          endDate: true,
          nextDueDate: true,
          deviceId: true,
          device: { select: { imei: true, label: true } },
        },
      },
    },
  });

  const rows = buildCustomerTableRows(customers);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {showArchived ? `Archived customers (${rows.length})` : customersTableTitle(rows.length)}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {showArchived
              ? "Inactive accounts hidden from reminders and assignment pickers. Restore a customer to bring them back to the active list."
              : "Local records; billing mode shows Stripe vs manual/Invoiless. Rows with a next due date sort to the top (soonest first)."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showArchived ? (
            <Link
              href="/admin/customers"
              className="inline-flex justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
            >
              Active customers
            </Link>
          ) : (
            <Link
              href="/admin/customers?view=archived"
              className="inline-flex justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
            >
              View archived
            </Link>
          )}
          <Link
            href="/admin/customers/new"
            className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Add customer
          </Link>
        </div>
      </div>

      <CustomersTable rows={rows} invoilessConfigured={invoilessConfigured} showArchived={showArchived} />
    </div>
  );
}
