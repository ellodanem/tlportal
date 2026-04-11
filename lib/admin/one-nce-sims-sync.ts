import { revalidatePath } from "next/cache";

import {
  fetchAllOneNceSimsFromList,
  fetchMergedSimFieldsForIccid,
  iccidFromSimPayload,
  parseSimDetailPayload,
} from "@/lib/nce/sim-api";
import { prisma } from "@/lib/db";

export function revalidateSimsAdminUi(simDetailId?: string) {
  revalidatePath("/admin/sims", "page");
  revalidatePath("/admin/sims", "layout");
  if (simDetailId) {
    revalidatePath(`/admin/sims/${simDetailId}`, "page");
    revalidatePath(`/admin/sims/${simDetailId}`, "layout");
  }
  revalidatePath("/admin", "layout");
}

/**
 * Full 1NCE inventory pull + per-ICCID merge (same as admin “Import SIMs from 1NCE”).
 * Callable from Server Actions and Route Handlers (cron).
 */
export async function executeOneNceSimsInventoryImport(): Promise<
  { ok: true; imported: number } | { ok: false; error: string }
> {
  if (!process.env.ONCE_CLIENT_ID?.trim() || !process.env.ONCE_CLIENT_SECRET?.trim()) {
    return { ok: false, error: "1NCE is not configured (ONCE_CLIENT_ID / ONCE_CLIENT_SECRET)." };
  }

  try {
    const rows = await fetchAllOneNceSimsFromList();
    let imported = 0;
    for (const row of rows) {
      const iccid = iccidFromSimPayload(row);
      if (!iccid) continue;
      const p = parseSimDetailPayload(row);
      await prisma.simCard.upsert({
        where: { iccid },
        create: {
          iccid,
          msisdn: p.msisdn,
          imsi: p.imsi,
          label: p.label,
          status: p.status ?? "Active",
          totalDataMB: p.totalDataMB,
          usedDataMB: p.usedDataMB,
          lastSyncedAt: new Date(),
        },
        update: {
          msisdn: p.msisdn ?? undefined,
          imsi: p.imsi ?? undefined,
          label: p.label ?? undefined,
          status: p.status ?? undefined,
          totalDataMB: p.totalDataMB ?? undefined,
          usedDataMB: p.usedDataMB ?? undefined,
          lastSyncedAt: new Date(),
        },
      });
      imported += 1;
    }

    const iccids = [
      ...new Set(
        rows.map(iccidFromSimPayload).filter((x): x is string => typeof x === "string" && x.length > 0),
      ),
    ];
    const chunkSize = 8;
    for (let i = 0; i < iccids.length; i += chunkSize) {
      const chunk = iccids.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (iccid) => {
          try {
            const p = await fetchMergedSimFieldsForIccid(iccid);
            await prisma.simCard.update({
              where: { iccid },
              data: {
                msisdn: p.msisdn ?? undefined,
                imsi: p.imsi ?? undefined,
                label: p.label ?? undefined,
                status: p.status ?? undefined,
                totalDataMB: p.totalDataMB ?? undefined,
                usedDataMB: p.usedDataMB ?? undefined,
                lastSyncedAt: new Date(),
              },
            });
          } catch {
            // Skip one ICCID if detail/quota fails.
          }
        }),
      );
    }

    revalidateSimsAdminUi();
    return { ok: true, imported };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed.";
    return { ok: false, error: message };
  }
}

export async function executeSyncSingleSimFromOneNce(
  simId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sim = await prisma.simCard.findUnique({ where: { id: simId } });
  if (!sim) {
    return { ok: false, error: "SIM not found." };
  }
  if (!process.env.ONCE_CLIENT_ID?.trim() || !process.env.ONCE_CLIENT_SECRET?.trim()) {
    return { ok: false, error: "1NCE is not configured (ONCE_CLIENT_ID / ONCE_CLIENT_SECRET)." };
  }

  try {
    const p = await fetchMergedSimFieldsForIccid(sim.iccid);
    await prisma.simCard.update({
      where: { id: sim.id },
      data: {
        msisdn: p.msisdn ?? undefined,
        imsi: p.imsi ?? undefined,
        label: p.label ?? undefined,
        status: p.status ?? undefined,
        totalDataMB: p.totalDataMB ?? undefined,
        usedDataMB: p.usedDataMB ?? undefined,
        lastSyncedAt: new Date(),
      },
    });
    revalidateSimsAdminUi(simId);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    return { ok: false, error: message };
  }
}
