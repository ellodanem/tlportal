import Link from "next/link";

import { SubscriptionOptionForm } from "@/components/admin/subscription-option-form";

export default function NewSubscriptionOptionPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/subscription-options" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Subscription options
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Add option</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Shown in the public registration form dropdown.</p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <SubscriptionOptionForm mode="create" />
      </div>
    </div>
  );
}
