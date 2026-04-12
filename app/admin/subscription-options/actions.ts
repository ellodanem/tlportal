"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export type SubscriptionOptionFormState = { error: string | null };

export async function updateSubscriptionOption(
  _prev: SubscriptionOptionFormState,
  formData: FormData,
): Promise<SubscriptionOptionFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const priceUsdRaw = String(formData.get("priceUsd") ?? "").trim();
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";

  if (!id) {
    return { error: "Missing id." };
  }

  const price = Number.parseFloat(priceUsdRaw);
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Enter a valid price greater than zero." };
  }

  const existing = await prisma.subscriptionOption.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return { error: "Option not found." };
  }

  try {
    await prisma.subscriptionOption.update({
      where: { id },
      data: { priceUsd: new Prisma.Decimal(price), isActive },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update option.";
    return { error: message };
  }

  revalidatePath("/admin/subscription-options");
  revalidatePath("/register");
  redirect("/admin/subscription-options");
}
