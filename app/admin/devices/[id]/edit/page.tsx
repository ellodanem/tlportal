import Link from "next/link";
import { notFound } from "next/navigation";

import { DeviceCommercialEditForm } from "@/components/admin/device-commercial-edit-form";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function EditDeviceCommercialPage({ params }: Props) {
  const { id } = await params;
  const device = await prisma.device.findUnique({
    where: { id },
    include: { deviceModel: true },
  });

  if (!device) {
    notFound();
  }

  const title = device.label?.trim() || device.imei;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/devices" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Devices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Device purpose &amp; tags
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {title} · {device.deviceModel.name} · IMEI {device.imei}
        </p>
      </div>

      <DeviceCommercialEditForm
        key={device.updatedAt.toISOString()}
        deviceId={device.id}
        usagePurpose={device.usagePurpose}
        tags={device.tags}
      />
    </div>
  );
}
