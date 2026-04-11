"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export type SubscriptionOptionFormState = { error: string | null };

export async function createSubscriptionOption(
  _prev: SubscriptionOptionFormState,
  formData: FormData,
): Promise<SubscriptionOptionFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "0").trim();
  const sortOrder = Number.parseInt(sortOrderRaw, 10);
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";

  if (!label) {
    return { error: "Label is required." };
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: "Sort order must be a number." };
  }

  try {
    await prisma.subscriptionOption.create({
      data: { label, sortOrder, isActive },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create option.";
    return { error: message };
  }

  revalidatePath("/admin/subscription-options");
  revalidatePath("/register");
  redirect("/admin/subscription-options");
}

export async function updateSubscriptionOption(
  _prev: SubscriptionOptionFormState,
  formData: FormData,
): Promise<SubscriptionOptionFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "0").trim();
  const sortOrder = Number.parseInt(sortOrderRaw, 10);
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";

  if (!id) {
    return { error: "Missing id." };
  }
  if (!label) {
    return { error: "Label is required." };
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: "Sort order must be a number." };
  }

  try {
    await prisma.subscriptionOption.update({
      where: { id },
      data: { label, sortOrder, isActive },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update option.";
    return { error: message };
  }

  revalidatePath("/admin/subscription-options");
  revalidatePath("/register");
  redirect("/admin/subscription-options");
}
