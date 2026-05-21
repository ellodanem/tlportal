"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { executeSyncSingleSimFromOneNce } from "@/lib/admin/one-nce-sims-sync";
import { importSimInventoryFromProvider } from "@/lib/services/sim-sync-service";

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
