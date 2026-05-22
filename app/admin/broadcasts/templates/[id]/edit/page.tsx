import Link from "next/link";
import { notFound } from "next/navigation";

import { BroadcastTemplateForm } from "@/components/admin/broadcast-template-form";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function EditBroadcastTemplatePage({ params }: Props) {
  const { id } = await params;
  const [row, session] = await Promise.all([
    prisma.broadcastTemplate.findUnique({ where: { id } }),
    getSession(),
  ]);

  if (!row) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/broadcasts" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Broadcasts
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit template</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{row.name}</p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <BroadcastTemplateForm
          isNew={false}
          initial={{
            id: row.id,
            name: row.name,
            category: row.category,
            subject: row.subject,
            bodyText: row.bodyText,
            isActive: row.isActive,
            isSystem: row.isSystem,
            defaultTestTo: session?.email ?? "",
          }}
        />
      </div>
    </div>
  );
}
