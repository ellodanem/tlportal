import "server-only";

import type { ExpensePaymentMethod, Prisma } from "@prisma/client";

import { monthRangeUtc } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";

export async function expenseMonthlyTotals(year: number, month: number): Promise<{
  total: number;
  count: number;
  byCategory: { categoryId: string | null; categoryName: string; total: number; count: number }[];
}> {
  const { start, end } = monthRangeUtc(year, month);
  const rows = await prisma.vendorBill.findMany({
    where: { billDate: { gte: start, lt: end }, status: { not: "void" } },
    select: {
      total: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });

  const byCategoryMap = new Map<string | null, { categoryName: string; total: number; count: number }>();
  let total = 0;

  for (const row of rows) {
    const amt = Number(row.total);
    total += amt;
    const key = row.categoryId;
    const existing = byCategoryMap.get(key) ?? {
      categoryName: row.category?.name ?? "Uncategorized",
      total: 0,
      count: 0,
    };
    existing.total += amt;
    existing.count += 1;
    byCategoryMap.set(key, existing);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.total - a.total);

  return { total, count: rows.length, byCategory };
}

export type ExpenseListFilters = {
  year: number;
  month: number;
  categoryId?: string | null;
  search?: string | null;
  receipt?: "attached" | "missing" | null;
  method?: ExpensePaymentMethod | null;
};

export function expenseListWhere(filters: ExpenseListFilters): Prisma.VendorBillWhereInput {
  const { start, end } = monthRangeUtc(filters.year, filters.month);
  return {
    billDate: { gte: start, lt: end },
    status: { not: "void" },
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.receipt === "attached" ? { receiptStoragePath: { not: null } } : {}),
    ...(filters.receipt === "missing" ? { receiptStoragePath: null } : {}),
    ...(filters.method ? { payments: { some: { method: filters.method, voidedAt: null } } } : {}),
    ...(filters.search
      ? {
          OR: [
            { vendor: { is: { name: { contains: filters.search, mode: "insensitive" } } } },
            { description: { contains: filters.search, mode: "insensitive" } },
            { vendorInvoiceNumber: { contains: filters.search, mode: "insensitive" } },
            { payments: { some: { reference: { contains: filters.search, mode: "insensitive" }, voidedAt: null } } },
          ],
        }
      : {}),
  };
}

export async function createExpenseCategory(name: string, description?: string | null): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");

  const maxSort = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.expenseCategory.create({
    data: {
      name: trimmed.slice(0, 80),
      description: description?.trim()?.slice(0, 200) ?? null,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
    },
    select: { id: true },
  });
  return created.id;
}

export async function setExpenseCategoryActive(categoryId: string, isActive: boolean): Promise<void> {
  await prisma.expenseCategory.update({
    where: { id: categoryId },
    data: { isActive },
  });
}
