import "server-only";

import { onceSimAdapter } from "@/lib/adapters/sim/once/adapter";

import { recordOperationalEvent } from "./operational-event-service";

export async function importSimInventoryFromProvider(actorUserId?: string | null) {
  const adapter = onceSimAdapter;
  if (!adapter.isConfigured()) {
    return { ok: false as const, error: "1NCE is not configured (ONCE_CLIENT_ID / ONCE_CLIENT_SECRET)." };
  }

  try {
    const { imported } = await adapter.importInventory();
    await recordOperationalEvent({
      category: "sim.imported",
      summary: `Imported ${imported} SIM(s) from 1NCE`,
      actorUserId: actorUserId ?? undefined,
      payload: { provider: "once", imported },
    });
    return { ok: true as const, imported };
  } catch (e) {
    const message = e instanceof Error ? e.message : "SIM import failed.";
    return { ok: false as const, error: message };
  }
}
