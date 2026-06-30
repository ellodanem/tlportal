import Link from "next/link";

import { ExpenseForm, type ExpenseCategoryOption, type ExpenseCustomerOption, type ExpenseDeviceOption } from "@/components/admin/expense-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

async function loadFormOptions() {
  const [categories, customers, devices] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customer.findMany({
      where: activeCustomerWhere,
      orderBy: [{ company: "asc" }, { lastName: "asc" }],
      select: { id: true, company: true, firstName: true, lastName: true },
    }),
    prisma.device.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, label: true, imei: true },
    }),
  ]);

  return {
    categories: categories as ExpenseCategoryOption[],
    customers: customers.map((c) => ({ id: c.id, label: customerDisplayName(c) })) as ExpenseCustomerOption[],
    devices: devices.map((d) => ({
      id: d.id,
      label: d.label?.trim() || d.imei,
    })) as ExpenseDeviceOption[],
  };
}

export default async function NewExpensePage() {
  const { categories, customers, devices } = await loadFormOptions();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/expenses" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Expenses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New expense</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Record a vendor payment with optional receipt upload and customer/device attribution.
        </p>
      </div>
      <ExpenseForm categories={categories} customers={customers} devices={devices} />
    </div>
  );
}
