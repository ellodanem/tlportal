"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export type CatalogPriceFormState = { error: string | null; ok?: boolean };

export async function updateCatalogStripePriceAction(
  _prev: CatalogPriceFormState,
  formData: FormData,
): Promise<CatalogPriceFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const stripePriceId = String(formData.get("stripePriceId") ?? "").trim();

  if (!id) {
    return { error: "Missing catalog row id." };
  }

  if (stripePriceId && !stripePriceId.startsWith("price_")) {
    return { error: "Stripe Price id should start with price_" };
  }

  try {
    await prisma.subscriptionCatalogPrice.update({
      where: { id },
      data: { stripePriceId: stripePriceId || null },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save." };
  }

  revalidatePath("/admin/subscription-options");
  return { error: null, ok: true };
}
