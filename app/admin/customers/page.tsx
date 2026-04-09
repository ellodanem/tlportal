import Link from "next/link";

import {
  CustomersTable,
  customersTableTitle,
  type CustomerTableRow,
} from "@/components/admin/customers-table";
import {
  customerDisplayName,
  customerInitials,
  earliestNextDue,
  rollupFromAssignments,
  tagsPreview,
} from "@/lib/admin/customer-list";
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
        where: {
          endDate: null,
          status: { not: "cancelled" },
        },
        select: {
          status: true,
          nextDueDate: true,
          deviceId: true,
        },
      },
    },
  });

  const rows: CustomerTableRow[] = customers.map((c) => {
    const assignments = c.serviceAssignments;
    const distinctDevices = new Set(assignments.map((a) => a.deviceId)).size;
    const subtitle = c.email?.trim() || c.phone?.trim() || "No email or phone";
    return {
      id: c.id,
      displayName: customerDisplayName(c),
      initials: customerInitials(c),
      subtitle,
      tagsLine: tagsPreview(c.tags),
      activeServices: assignments.length,
      distinctDevices,
      nextDue: earliestNextDue(assignments),
      invoilessLinked: Boolean(c.invoilessCustomerId),
      rollup: rollupFromAssignments(assignments),
      updatedAt: c.updatedAt,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {customersTableTitle(customers.length)}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            At-a-glance services, fleet footprint, billing link, and renewal dates. Open a row for the full customer
            view.
          </p>
        </div>
        <Link
          href="/admin/customers/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          <span className="text-lg leading-none">+</span>
          New customer
        </Link>
      </div>

      <CustomersTable rows={rows} invoilessConfigured={invoilessConfigured} />
    </div>
  );
}
