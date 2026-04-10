import Link from "next/link";

import { DeviceRegisterForm } from "@/components/admin/device-register-form";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { fetchSimsAvailableForDeviceLink } from "@/lib/admin/sims-available-for-device";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RegisterDevicePage() {
  const [deviceModels, unlinkedSims, customerRows] = await Promise.all([
    prisma.deviceModel.findMany({
      where: { isActive: true },
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
      select: { id: true, name: true, manufacturer: true },
    }),
    fetchSimsAvailableForDeviceLink(),
    prisma.customer.findMany({
      orderBy: [{ company: "asc" }, { lastName: "asc" }],
      select: { id: true, company: true, firstName: true, lastName: true },
    }),
  ]);

  const customers = customerRows.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/devices"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Devices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Register device</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Add a tracker or gateway: enter IMEI and model, optionally link an unassigned SIM, and optionally assign an
          active service to a customer.
        </p>
      </div>

      <DeviceRegisterForm deviceModels={deviceModels} unlinkedSims={unlinkedSims} customers={customers} />
    </div>
  );
}
