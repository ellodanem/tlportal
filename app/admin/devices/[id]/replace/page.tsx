import Link from "next/link";
import { notFound } from "next/navigation";

import { DeviceReplacementWorkflow } from "@/components/admin/device-replacement-workflow";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { fetchSimsAvailableForDeviceSwap } from "@/lib/admin/sims-available-for-device";
import { prisma } from "@/lib/db";

export default async function ReplaceDevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [device, assignment, replacements, availableSims] = await Promise.all([
    prisma.device.findUnique({ where: { id }, include: { deviceModel: { select: { name: true } }, simCard: { select: { id: true, iccid: true } } } }),
    prisma.serviceAssignment.findFirst({ where: { deviceId: id, endDate: null, status: { not: "cancelled" } }, select: { id: true, status: true, subscriptionItemId: true, customer: { select: { company: true, firstName: true, lastName: true } } } }),
    prisma.device.findMany({ where: { id: { not: id }, status: "in_stock", condition: { not: "faulty" }, serviceAssignments: { none: { endDate: null, status: { not: "cancelled" } } } }, orderBy: [{ deviceModel: { name: "asc" } }, { imei: "asc" }], select: { id: true, imei: true, label: true, condition: true, deviceModel: { select: { name: true } } } }),
    fetchSimsAvailableForDeviceSwap(),
  ]);
  if (!device) notFound();
  const deviceLabel = device.label?.trim() || device.deviceModel.name;

  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link href={`/admin/devices/${id}/edit`} className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">← {deviceLabel}</Link><h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Replace device</h1><p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">Change hardware while preserving the appropriate customer tracking service.</p></div><Link href={`/admin/devices/${id}/edit`} className="inline-flex justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">Cancel</Link></div>
    {assignment ? <DeviceReplacementWorkflow assignmentId={assignment.id} currentInstallation={{ customer: customerDisplayName(assignment.customer), device: `${device.deviceModel.name} · ${device.imei}`, service: assignment.status === "suspended" ? "Paused installation" : "Active installation" }} devices={replacements.map((replacement) => ({ id: replacement.id, label: `${replacement.label?.trim() || replacement.deviceModel.name} · ${replacement.imei}`, detail: `${replacement.deviceModel.name} · ${replacement.condition}` }))} currentSim={device.simCard} availableSims={availableSims} /> : <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No active installation to replace</h2><p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Hardware replacement is available only for an open device assignment. Assign this device first, or return to the device record.</p><Link href={`/admin/devices/${id}/edit?tab=assignment`} className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Open assignment</Link></section>}
  </div>;
}
