import Link from "next/link";

import { CustomerCreateForm } from "@/components/customer-form";

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New customer</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Fields mirror Invoiless customer billing: company <em>or</em> first and last name is required for invoice sync.
          Street, city, postal, and country are combined into one bill-to address when you push to Invoiless.
        </p>
      </div>
      <CustomerCreateForm />
    </div>
  );
}
