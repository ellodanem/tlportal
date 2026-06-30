"use server";

import { revalidatePath } from "next/cache";

import { parseExpenseRequestBody, type ExpenseRequestPayload } from "@/lib/expenses/expense-payload";
import { removeExpenseReceipt, uploadExpenseReceipt } from "@/lib/expenses/receipt-storage";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  setExpenseCategoryActive,
  updateExpense,
  type ExpenseInput,
} from "@/lib/services/expense-service";

export type SaveExpenseState = { error?: string; ok?: boolean; expenseId?: string; next?: string };
export type DeleteExpenseState = { error?: string; ok?: boolean };
export type CategoryFormState = { error?: string; ok?: boolean; message?: string };

function payloadToInput(payload: ExpenseRequestPayload, recordedById: string): ExpenseInput {
  return {
    vendor: payload.vendor,
    description: payload.description,
    amount: payload.amount,
    currency: payload.currency,
    expenseDate: new Date(`${payload.expenseDate}T12:00:00.000Z`),
    method: payload.method,
    reference: payload.reference,
    notes: payload.notes,
    categoryId: payload.categoryId,
    customerId: payload.customerId,
    deviceId: payload.deviceId,
    recordedById,
  };
}

function parsePayloadFromForm(formData: FormData): ReturnType<typeof parseExpenseRequestBody> {
  const raw = String(formData.get("expensePayloadJson") ?? "").trim();
  if (!raw) return { error: "Expense data is missing." };
  try {
    return parseExpenseRequestBody(JSON.parse(raw) as unknown);
  } catch {
    return { error: "Expense data is invalid." };
  }
}

export async function saveExpenseAction(_prev: SaveExpenseState, formData: FormData): Promise<SaveExpenseState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const expenseId = String(formData.get("expenseId") ?? "").trim();
  const receiptFile = formData.get("receipt");
  let receiptPath: string | null | undefined;

  if (receiptFile instanceof File && receiptFile.size > 0) {
    const uploaded = await uploadExpenseReceipt(receiptFile);
    if ("error" in uploaded) return { error: uploaded.error };
    receiptPath = uploaded.path;

    if (expenseId) {
      const existing = await prisma.expense.findUnique({
        where: { id: expenseId },
        select: { receiptStoragePath: true },
      });
      if (existing?.receiptStoragePath) {
        await removeExpenseReceipt(existing.receiptStoragePath);
      }
    }
  }

  const input = payloadToInput(parsed.payload, session.sub);
  if (receiptPath !== undefined) {
    input.receiptStoragePath = receiptPath;
  }

  try {
    if (expenseId) {
      await updateExpense(expenseId, input);
      revalidatePath("/admin/expenses");
      revalidatePath(`/admin/expenses/${expenseId}`);
      return { ok: true, expenseId, next: `/admin/expenses/${expenseId}` };
    }
    const id = await createExpense({
      ...input,
      receiptStoragePath: receiptPath ?? null,
    });
    revalidatePath("/admin/expenses");
    return { ok: true, expenseId: id, next: `/admin/expenses/${id}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save expense." };
  }
}

export async function deleteExpenseAction(_prev: DeleteExpenseState, formData: FormData): Promise<DeleteExpenseState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const expenseId = String(formData.get("expenseId") ?? "").trim();
  if (!expenseId) return { error: "Expense id is missing." };

  try {
    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { receiptStoragePath: true },
    });
    await deleteExpense(expenseId);
    if (existing?.receiptStoragePath) {
      await removeExpenseReceipt(existing.receiptStoragePath);
    }
    revalidatePath("/admin/expenses");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete expense." };
  }
}

export async function createExpenseCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  try {
    await createExpenseCategory(name, description);
    revalidatePath("/admin/expenses/categories");
    revalidatePath("/admin/expenses");
    return { ok: true, message: "Category added." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add category." };
  }
}

export async function toggleExpenseCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (!categoryId) return { error: "Category id is missing." };

  try {
    await setExpenseCategoryActive(categoryId, isActive);
    revalidatePath("/admin/expenses/categories");
    revalidatePath("/admin/expenses");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update category." };
  }
}
