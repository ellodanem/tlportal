import Link from "next/link";

import { BroadcastTemplateForm } from "@/components/admin/broadcast-template-form";
import { getSession } from "@/lib/auth/get-session";

export default async function NewBroadcastTemplatePage() {
  const session = await getSession();

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/broadcasts" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Broadcasts
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New template</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Create reusable copy for operational emails. Use test send before your first real broadcast.
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <BroadcastTemplateForm
          isNew
          initial={{
            name: "",
            category: "general",
            subject: "",
            bodyText: "",
            isActive: true,
            isSystem: false,
            defaultTestTo: session?.email ?? "",
          }}
        />
      </div>
    </div>
  );
}
