import {
  DeviceModelsView,
  type DeviceModelTableRow,
} from "@/components/admin/device-models/device-models-view";
import { prisma } from "@/lib/db";

function formatMoney(v: { toString: () => string } | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v.toString());
  return Number.isNaN(n) ? v.toString() : n.toFixed(2);
}

export default async function DeviceModelsPage() {
  const models = await prisma.deviceModel.findMany({
    orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { devices: true } },
    },
  });

  const rows: DeviceModelTableRow[] = models.map((m) => ({
    id: m.id,
    name: m.name,
    manufacturer: m.manufacturer,
    category: m.category,
    retail: formatMoney(m.retailPrice),
    cost: formatMoney(m.costPrice),
    isActive: m.isActive,
    deviceCount: m._count.devices,
  }));

  return <DeviceModelsView models={rows} />;
}
