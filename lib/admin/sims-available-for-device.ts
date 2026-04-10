import type { UnlinkedSimRow } from "@/lib/admin/unlinked-sim-filter";
import { prisma } from "@/lib/db";

/**
 * SIMs safe to attach when registering a device: not referenced by any device and not tied to an open assignment.
 */
export async function fetchSimsAvailableForDeviceLink(): Promise<UnlinkedSimRow[]> {
  const [deviceLinked, assignmentLinked] = await Promise.all([
    prisma.device.findMany({
      where: { simCardId: { not: null } },
      select: { simCardId: true },
    }),
    prisma.serviceAssignment.findMany({
      where: {
        endDate: null,
        status: { not: "cancelled" },
        simCardId: { not: null },
      },
      select: { simCardId: true },
    }),
  ]);

  const busy = new Set<string>();
  for (const d of deviceLinked) {
    if (d.simCardId) {
      busy.add(d.simCardId);
    }
  }
  for (const a of assignmentLinked) {
    if (a.simCardId) {
      busy.add(a.simCardId);
    }
  }

  const busyIds = [...busy];
  return prisma.simCard.findMany({
    where: busyIds.length > 0 ? { id: { notIn: busyIds } } : {},
    orderBy: { iccid: "asc" },
    select: { id: true, iccid: true, label: true, msisdn: true },
  });
}
