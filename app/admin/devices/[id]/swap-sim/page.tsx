import Link from "next/link";
import { notFound } from "next/navigation";

import { DeviceSimSwapWorkflow } from "@/components/admin/device-sim-swap-workflow";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { fetchSimsAvailableForDeviceSwap } from "@/lib/admin/sims-available-for-device";
import { formatMegabytes } from "@/lib/format/mbytes";
import { prisma } from "@/lib/db";

export default async function SwapDeviceSimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [device, assignment, availableSims] = await Promise.all([
    prisma.device.findUnique({ where: { id }, include: { deviceModel: { select: { name: true } }, simCard: { select: { iccid: true, providerName: true, usedDataMB: true, totalDataMB: true, lastSyncedAt: true } } } }),
    prisma.serviceAssignment.findFirst({ where: { deviceId: id, endDate: null, status: { not: "cancelled" } }, select: { customer: { select: { company: true, firstName: true, lastName: true } } } }),
    fetchSimsAvailableForDeviceSwap(),
  ]);
  if (!device) notFound();
  const deviceLabel = `${device.label?.trim() || device.deviceModel.name} · ${device.imei}`;
  const canEdit = !["decommissioned", "lost"].includes(device.status);
  const sim = device.simCard;

  return <div className="mx-auto w-full max-w-6xl space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link href={`/admin/devices/${id}/edit`} className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">← {device.label?.trim() || device.deviceModel.name}</Link><h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{sim ? "Swap SIM" : "Link SIM"}</h1><p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">Choose an eligible SIM for this device and review the resulting assignment change.</p></div><Link href={`/admin/devices/${id}/edit`} className="inline-flex justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">Cancel</Link></div>{canEdit ? <DeviceSimSwapWorkflow deviceId={id} device={deviceLabel} customer={assignment ? customerDisplayName(assignment.customer) : null} currentSim={sim ? { iccid: sim.iccid, provider: sim.providerName?.trim() || "Unknown provider", quota: sim.usedDataMB != null && sim.totalDataMB != null ? `${formatMegabytes(sim.usedDataMB)} / ${formatMegabytes(sim.totalDataMB)} (provider snapshot)` : "Quota unknown", synced: sim.lastSyncedAt ? sim.lastSyncedAt.toLocaleString() : "Not synchronized" } : null} availableSims={availableSims} /> : <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-lg font-semibold">SIM changes are unavailable</h2><p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">A decommissioned or lost device cannot be linked to a SIM.</p></section>}</div>;
}
