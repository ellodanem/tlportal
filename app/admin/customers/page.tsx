import Link from "next/link";

import {
  archivedCustomersTableTitle,
  customerListTotals,
  CustomersTable,
  customersTableTitle,
} from "@/components/admin/customers-table";
import { CustomerListControls } from "@/components/admin/customer-list-controls";
import { buildCustomerTableRows } from "@/lib/admin/customer-table-rows";
import { activeCustomerWhere, archivedCustomerWhere } from "@/lib/admin/active-customer-filter";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type Props = { searchParams: Promise<{ view?: string; q?: string }> };

export default async function CustomersPage({ searchParams }: Props) {
  const { view: rawView, q: rawQuery } = await searchParams;
  const view = rawView === "archived" || rawView === "attention" || rawView === "stripe" || rawView === "manual" || rawView === "no-services" ? rawView : "all";
  const query = rawQuery?.trim() ?? "";
  const showArchived = view === "archived";
  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());
  const dueSoon = new Date();
  dueSoon.setDate(dueSoon.getDate() + 7);
  const where: Prisma.CustomerWhereInput = {
    ...(showArchived ? archivedCustomerWhere : activeCustomerWhere),
    AND: [
      ...(query
        ? [{
            OR: [
              { company: { contains: query, mode: "insensitive" as const } },
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: query, mode: "insensitive" as const } },
            ],
          }]
        : []),
      ...(view === "attention"
        ? [{
            OR: [
              { serviceAssignments: { some: { endDate: null, status: "suspended" as const } } },
              { serviceAssignments: { some: { endDate: null, status: { not: "cancelled" as const }, nextDueDate: { lte: dueSoon } } } },
              { billingAccounts: { some: { provider: "stripe" as const, status: { in: ["past_due", "unpaid"] } } } },
            ],
          }]
        : []),
    ],
    ...(view === "stripe" ? { billingMode: "stripe_subscription" } : {}),
    ...(view === "manual" ? { billingMode: "manual_legacy" } : {}),
    ...(view === "no-services" ? { serviceAssignments: { none: { endDate: null, status: { not: "cancelled" } } } } : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
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
  const totals = customerListTotals(rows);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {showArchived
              ? archivedCustomersTableTitle(rows.length, totals.activeServices)
              : customersTableTitle(rows.length, totals.activeServices)}
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

      <CustomerListControls query={query} view={view} showArchived={showArchived} />

      <CustomersTable rows={rows} invoilessConfigured={invoilessConfigured} showArchived={showArchived} />
    </div>
  );
}
