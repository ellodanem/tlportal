import Link from "next/link";

import { ensureBroadcastTemplates } from "@/lib/broadcast/ensure-templates";
import { broadcastCategoryLabel } from "@/lib/broadcast/template-labels";
import { prisma } from "@/lib/db";

export default async function BroadcastsPage() {
  await ensureBroadcastTemplates();

  const templates = await prisma.broadcastTemplate.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      subject: true,
      isActive: true,
      isSystem: true,
      updatedAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Broadcasts</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Message templates for emailing customers (for example during an outage). Configure copy here, send test
            emails to verify SMTP, then use campaigns to reach your audience — coming next.
          </p>
        </div>
        <Link
          href="/admin/broadcasts/templates/new"
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          New template
        </Link>
      </div>

      <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">Campaigns</strong> — Send to many customers
        with audience filters (active / inactive, deduped emails) will appear in the next step. Templates are ready now.
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Templates</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                    No templates yet.
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                      {t.name}
                      {t.isSystem ? (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          System
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{broadcastCategoryLabel(t.category)}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400" title={t.subject}>
                      {t.subject}
                    </td>
                    <td className="px-4 py-3">
                      {t.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                          Yes
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/broadcasts/templates/${t.id}/edit`}
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
