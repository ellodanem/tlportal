import Link from "next/link";

import { BroadcastCampaignWizard } from "@/components/admin/broadcast-campaign-wizard";
import { ensureBroadcastTemplates } from "@/lib/broadcast/ensure-templates";
import { prisma } from "@/lib/db";

export default async function NewBroadcastCampaignPage() {
  await ensureBroadcastTemplates();

  const templates = await prisma.broadcastTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, subject: true, bodyText: true },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/broadcasts" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Broadcasts
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New broadcast</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Email customers in bulk. Messages use SMTP from Settings; duplicate addresses receive one email.
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <BroadcastCampaignWizard templates={templates} />
      </div>
    </div>
  );
}
