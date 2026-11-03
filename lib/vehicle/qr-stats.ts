import "server-only";

import { prisma } from "@/lib/db";
import {
  VEHICLE_QR_VISIT_CATEGORY,
  VEHICLE_QR_WHATSAPP_CLICK_CATEGORY,
} from "@/lib/vehicle/qr-landing";

export type VehicleQrSourceRow = { source: string; visits: number; clicks: number };

export type VehicleQrStats = {
  visits: number;
  clicks: number;
  visits30d: number;
  clicks30d: number;
  bySource: VehicleQrSourceRow[];
};

const NO_SOURCE = "(no tag)";

export async function getVehicleQrStats(): Promise<VehicleQrStats> {
  const events = await prisma.operationalEvent.findMany({
    where: { category: { in: [VEHICLE_QR_VISIT_CATEGORY, VEHICLE_QR_WHATSAPP_CLICK_CATEGORY] } },
    select: { category: true, occurredAt: true, payload: true },
  });

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const stats: VehicleQrStats = { visits: 0, clicks: 0, visits30d: 0, clicks30d: 0, bySource: [] };
  const map = new Map<string, VehicleQrSourceRow>();

  for (const e of events) {
    const isClick = e.category === VEHICLE_QR_WHATSAPP_CLICK_CATEGORY;
    const recent = e.occurredAt.getTime() >= cutoff;
    const payload = e.payload as { source?: string | null } | null;
    const source = payload?.source || NO_SOURCE;

    const row = map.get(source) ?? { source, visits: 0, clicks: 0 };
    if (isClick) {
      stats.clicks += 1;
      row.clicks += 1;
      if (recent) stats.clicks30d += 1;
    } else {
      stats.visits += 1;
      row.visits += 1;
      if (recent) stats.visits30d += 1;
    }
    map.set(source, row);
  }

  stats.bySource = [...map.values()].sort((a, b) => b.visits + b.clicks - (a.visits + a.clicks));
  return stats;
}
