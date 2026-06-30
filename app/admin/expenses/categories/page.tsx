import Link from "next/link";

import { ExpenseCategoriesClient } from "@/components/admin/expense-categories-client";
import { prisma } from "@/lib/db";

export default async function ExpenseCategoriesPage() {
  const categories = await prisma.expenseCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { expenses: true } } },
  });

  const rows = categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    isActive: c.isActive,
    expenseCount: c._count.expenses,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/expenses" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Expenses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Expense categories</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Organize expenses for monthly totals and reporting. Hide unused categories instead of deleting.
        </p>
      </div>
      <ExpenseCategoriesClient categories={rows} />
    </div>
  );
}
