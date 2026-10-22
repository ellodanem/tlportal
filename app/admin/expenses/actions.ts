"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import {
  createExpenseCategory,
  setExpenseCategoryActive,
} from "@/lib/services/expense-service";

export type CategoryFormState = { error?: string; ok?: boolean; message?: string };

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
    revalidatePath("/admin/bills");
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
    revalidatePath("/admin/bills");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update category." };
  }
}
