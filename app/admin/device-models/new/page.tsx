import Link from "next/link";

import { DeviceModelCreateForm } from "@/components/admin/device-model-form";

export default function NewDeviceModelPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/device-models"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Device models
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New device model</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add a product name, optional manufacturer, and pricing. Active models appear in the Register device dropdown.
        </p>
      </div>
      <DeviceModelCreateForm />
    </div>
  );
}
