import "server-only";

import type { ExpensePaymentMethod, Prisma } from "@prisma/client";

import { monthRangeUtc } from "@/lib/domain/expenses";
import { toMoneyString } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

export type ExpenseInput = {
  vendor: string;
  description?: string | null;
  amount: number;
  currency?: string;
  expenseDate: Date;
  method?: ExpensePaymentMethod;
  reference?: string | null;
  notes?: string | null;
  categoryId?: string | null;
  customerId?: string | null;
  deviceId?: string | null;
  receiptStoragePath?: string | null;
  recordedById?: string | null;
};

export async function createExpense(input: ExpenseInput): Promise<string> {
  const created = await prisma.expense.create({
    data: {
      vendor: input.vendor,
      description: input.description ?? null,
      amount: toMoneyString(input.amount),
      currency: (input.currency ?? "XCD").toUpperCase(),
      expenseDate: input.expenseDate,
      method: input.method ?? "card",
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      categoryId: input.categoryId ?? null,
      customerId: input.customerId ?? null,
      deviceId: input.deviceId ?? null,
      receiptStoragePath: input.receiptStoragePath ?? null,
      recordedById: input.recordedById ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateExpense(expenseId: string, input: ExpenseInput): Promise<void> {
  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      vendor: input.vendor,
      description: input.description ?? null,
      amount: toMoneyString(input.amount),
      currency: (input.currency ?? "XCD").toUpperCase(),
      expenseDate: input.expenseDate,
      method: input.method ?? "card",
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      categoryId: input.categoryId ?? null,
      customerId: input.customerId ?? null,
      deviceId: input.deviceId ?? null,
      recordedById: input.recordedById ?? null,
      ...(input.receiptStoragePath !== undefined ? { receiptStoragePath: input.receiptStoragePath } : {}),
    },
  });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await prisma.expense.delete({ where: { id: expenseId } });
}

export async function expenseMonthlyTotals(year: number, month: number): Promise<{
  total: number;
  count: number;
  byCategory: { categoryId: string | null; categoryName: string; total: number; count: number }[];
}> {
  const { start, end } = monthRangeUtc(year, month);
  const rows = await prisma.expense.findMany({
    where: { expenseDate: { gte: start, lt: end } },
    select: {
      amount: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });

  const byCategoryMap = new Map<string | null, { categoryName: string; total: number; count: number }>();
  let total = 0;

  for (const row of rows) {
    const amt = Number(row.amount);
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
};

export function expenseListWhere(filters: ExpenseListFilters): Prisma.ExpenseWhereInput {
  const { start, end } = monthRangeUtc(filters.year, filters.month);
  return {
    expenseDate: { gte: start, lt: end },
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
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
