import Link from "next/link";

import { DevicesTableClient } from "@/components/admin/devices-table-client";
import { mapDeviceToListRow } from "@/lib/admin/device-list";
import { prisma } from "@/lib/db";

export default async function AdminDevicesPage() {
  const devices = await prisma.device.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      deviceModel: true,
      simCard: true,
      serviceAssignments: {
        where: {
          endDate: null,
          status: { not: "cancelled" },
        },
        orderBy: { startDate: "desc" },
        take: 1,
        include: {
          customer: {
            select: {
              id: true,
              company: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  const rows = devices.map((d) => mapDeviceToListRow(d));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Devices</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Register hardware in stock, then use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Manage</strong>{" "}
            on a row to assign a customer when you&apos;re ready. Link a SIM for cellular data, and use{" "}
            <Link href="/admin/sims" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              SIM cards
            </Link>{" "}
            for ICCID and usage detail.
          </p>
        </div>
        <Link
          href="/admin/devices/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          <span className="text-lg leading-none">+</span>
          Register Device
        </Link>
      </div>

      <DevicesTableClient rows={rows} />
    </div>
  );
}
