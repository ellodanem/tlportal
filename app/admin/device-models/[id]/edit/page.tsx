import Link from "next/link";
import { notFound } from "next/navigation";

import { DeviceModelEditForm } from "@/components/admin/device-model-form";
import { DeviceModelSetupCommands } from "@/components/admin/device-model-setup-commands";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function EditDeviceModelPage({ params }: Props) {
  const { id } = await params;
  const model = await prisma.deviceModel.findUnique({
    where: { id },
    include: {
      setupCommands: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!model) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/device-models"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Device models
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit device model</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{model.name}</p>
      </div>
      <DeviceModelEditForm
        id={model.id}
        defaults={{
          name: model.name,
          manufacturer: model.manufacturer,
          category: model.category,
          description: model.description,
          retailPrice: model.retailPrice,
          costPrice: model.costPrice,
          isActive: model.isActive,
        }}
      />
      <DeviceModelSetupCommands
        deviceModelId={model.id}
        commands={model.setupCommands.map((command) => ({
          id: command.id,
          name: command.name,
          body: command.body,
          note: command.note,
        }))}
      />
    </div>
  );
}
