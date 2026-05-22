import Link from "next/link";

import { broadcastCampaignStatusLabel, broadcastCampaignStatusTone } from "@/lib/broadcast/campaign-status";
import { ensureBroadcastTemplates } from "@/lib/broadcast/ensure-templates";
import { broadcastCategoryLabel } from "@/lib/broadcast/template-labels";
import { prisma } from "@/lib/db";

function campaignBadgeClass(tone: ReturnType<typeof broadcastCampaignStatusTone>): string {
  switch (tone) {
    case "progress":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200";
    case "success":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "warning":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
    case "error":
      return "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

export default async function BroadcastsPage() {
  await ensureBroadcastTemplates();

  const [templates, campaigns] = await Promise.all([
    prisma.broadcastTemplate.findMany({
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
    }),
    prisma.broadcastCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        subjectSnapshot: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        includeInactive: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Broadcasts</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Email many customers at once (for example during an outage). Templates hold reusable copy; campaigns send to
            your audience with deduplicated addresses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/broadcasts/new"
            className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            New broadcast
          </Link>
          <Link
            href="/admin/broadcasts/templates/new"
            className="inline-flex justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            New template
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent campaigns</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                    No campaigns yet.{" "}
                    <Link href="/admin/broadcasts/new" className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
                      Send your first broadcast
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => {
                  const tone = broadcastCampaignStatusTone(c.status);
                  return (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {c.createdAt.toLocaleString()}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-zinc-900 dark:text-zinc-50" title={c.subjectSnapshot}>
                        {c.subjectSnapshot}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                        {c.sentCount}/{c.totalRecipients}
                        {c.failedCount > 0 ? (
                          <span className="ml-1 text-red-700 dark:text-red-400">({c.failedCount} failed)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${campaignBadgeClass(tone)}`}>
                          {broadcastCampaignStatusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/broadcasts/${c.id}`}
                          className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
              {templates.map((t) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
