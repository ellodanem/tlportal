"use server";

import {
  executeOneNceSimsInventoryImport,
  executeSyncSingleSimFromOneNce,
} from "@/lib/admin/one-nce-sims-sync";

export async function syncSimFromOneNce(simId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return executeSyncSingleSimFromOneNce(simId);
}

/**
 * Pull SIM inventory from 1NCE GET /v1/sims and upsert into SimCard by ICCID.
 */
export async function importSimsFromOneNce(): Promise<
  { ok: true; imported: number } | { ok: false; error: string }
> {
  return executeOneNceSimsInventoryImport();
}
