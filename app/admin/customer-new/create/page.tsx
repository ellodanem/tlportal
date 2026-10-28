import Link from "next/link";

import { CreateCustomerForm } from "@/components/admin/customer-new/create-customer-form";

export default function CreateCustomerNewPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/admin/customer-new" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New customer</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add the customer&apos;s contact details. Subscriptions are created afterwards from the customer&apos;s page.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <CreateCustomerForm />
      </div>
    </div>
  );
}
