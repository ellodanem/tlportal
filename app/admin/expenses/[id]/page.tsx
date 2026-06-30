import Link from "next/link";
import { notFound } from "next/navigation";

import { ExpenseDeleteForm } from "@/components/admin/expense-delete-form";
import {
  ExpenseForm,
  type ExpenseCategoryOption,
  type ExpenseCustomerOption,
  type ExpenseDeviceOption,
  type ExpenseFormInitial,
} from "@/components/admin/expense-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [expense, categories, customers, devices] = await Promise.all([
    prisma.expense.findUnique({ where: { id } }),
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

  if (!expense) notFound();

  const initial: ExpenseFormInitial = {
    expenseId: expense.id,
    vendor: expense.vendor,
    description: expense.description ?? "",
    amount: String(expense.amount),
    currency: expense.currency,
    expenseDate: formatYmd(expense.expenseDate),
    method: expense.method,
    reference: expense.reference ?? "",
    notes: expense.notes ?? "",
    categoryId: expense.categoryId ?? "",
    customerId: expense.customerId ?? "",
    deviceId: expense.deviceId ?? "",
    hasReceipt: Boolean(expense.receiptStoragePath),
  };

  const customerOptions: ExpenseCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
  }));
  const deviceOptions: ExpenseDeviceOption[] = devices.map((d) => ({
    id: d.id,
    label: d.label?.trim() || d.imei,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/expenses" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Expenses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{expense.vendor}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Recorded {expense.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>

      <ExpenseForm
        categories={categories as ExpenseCategoryOption[]}
        customers={customerOptions}
        devices={deviceOptions}
        initial={initial}
      />

      <ExpenseDeleteForm expenseId={expense.id} />
    </div>
  );
}
