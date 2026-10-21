"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { executeSyncSingleSimFromOneNce } from "@/lib/admin/one-nce-sims-sync";
import { importSimInventoryFromProvider } from "@/lib/services/sim-sync-service";
import { prisma } from "@/lib/db";

export async function createManualSim(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const iccid = String(formData.get("iccid") ?? "").trim().replace(/[\s-]/g, "");
  const providerName = String(formData.get("providerName") ?? "").trim();
  const totalRaw = String(formData.get("totalDataMB") ?? "").trim();
  const totalDataMB = totalRaw ? Number(totalRaw) : null;
  if (!/^[0-9]{10,32}$/.test(iccid)) return { error: "Enter an ICCID using 10–32 digits." };
  if (!providerName) return { error: "Provider name is required." };
  if (totalDataMB != null && (!Number.isFinite(totalDataMB) || totalDataMB < 0)) return { error: "Reported quota must be a non-negative number." };
  try {
    await prisma.simCard.create({ data: { iccid, providerName, source: "manual", label: String(formData.get("label") ?? "").trim() || null, msisdn: String(formData.get("msisdn") ?? "").trim() || null, imsi: String(formData.get("imsi") ?? "").trim() || null, notes: String(formData.get("notes") ?? "").trim() || null, totalDataMB, status: "Unknown" } });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { error: "That ICCID already exists." };
    return { error: "Could not add SIM. Please try again." };
  }
  revalidatePath("/admin/sims");
  return { error: null };
}

export async function syncSimFromOneNce(simId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return executeSyncSingleSimFromOneNce(simId);
}

/**
 * Pull SIM inventory from 1NCE GET /v1/sims and upsert into SimCard by ICCID.
 */
export async function importSimsFromOneNce(): Promise<
  { ok: true; imported: number } | { ok: false; error: string }
> {
  const session = await getSession();
  const result = await importSimInventoryFromProvider(session?.sub ?? null);
  if (result.ok) {
    revalidatePath("/admin/sims");
    revalidatePath("/admin");
  }
  return result;
}
