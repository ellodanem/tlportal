import Link from "next/link";
import { notFound } from "next/navigation";

import { BroadcastCampaignDetailClient } from "@/components/admin/broadcast-campaign-detail";
import { broadcastCampaignStatusLabel, broadcastCampaignStatusTone } from "@/lib/broadcast/campaign-status";
import { applyBroadcastMergeFields } from "@/lib/broadcast/merge-fields";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

function statusBadgeClass(tone: ReturnType<typeof broadcastCampaignStatusTone>): string {
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

export default async function BroadcastCampaignPage({ params }: Props) {
  const { id } = await params;
  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true } },
      deliveries: {
        where: { status: "failed" },
        take: 50,
        orderBy: { createdAt: "asc" },
        include: {
          customer: {
            select: { company: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!campaign) {
    notFound();
  }

  const tone = broadcastCampaignStatusTone(campaign.status);
  const audienceLabel = campaign.includeInactive
    ? "All customers with email"
    : "Active customers with email only";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div>
        <Link href="/admin/broadcasts" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Broadcasts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Campaign</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{campaign.subjectSnapshot}</p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <BroadcastCampaignDetailClient
          campaignId={campaign.id}
          initial={{
            status: campaign.status,
            totalRecipients: campaign.totalRecipients,
            sentCount: campaign.sentCount,
            failedCount: campaign.failedCount,
            skippedCount: campaign.skippedCount,
          }}
        />
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Status</dt>
            <dd className="mt-0.5">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(tone)}`}>
                {broadcastCampaignStatusLabel(campaign.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Audience</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{audienceLabel}</dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Template</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{campaign.template?.name ?? "Custom"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Started</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">
              {campaign.startedAt ? campaign.startedAt.toLocaleString() : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Message sent</h2>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {applyBroadcastMergeFields(campaign.bodyTextSnapshot, {
            incident_title: campaign.incidentTitle ?? "",
            incident_status: campaign.incidentStatus ?? "",
            eta: campaign.incidentEta ?? "",
          })}
        </pre>
      </section>

      {campaign.deliveries.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Failed deliveries</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {campaign.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${d.customerId}`}
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        {[d.customer.company, [d.customer.firstName, d.customer.lastName].filter(Boolean).join(" ")]
                          .find(Boolean) || "Customer"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{d.email}</td>
                    <td className="px-4 py-3 text-red-800 dark:text-red-300">{d.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
