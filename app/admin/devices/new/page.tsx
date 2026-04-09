import Link from "next/link";

export default function NewDevicePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New device</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Device registration is coming soon. You will be able to add trackers and gateways from here.
        </p>
        <p className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/admin" className="text-emerald-700 hover:underline dark:text-emerald-400">
            ← Admin dashboard
          </Link>
          <Link href="/admin/customers" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Customers
          </Link>
        </p>
      </div>
    </div>
  );
}
