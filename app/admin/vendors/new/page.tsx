import Link from "next/link";

import { VendorForm } from "@/components/admin/vendor-form";

export default function NewVendorPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/vendors" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Vendors</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New vendor</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Create a reusable supplier record for expenses and future bills.</p>
      </div>
      <VendorForm />
    </div>
  );
}
