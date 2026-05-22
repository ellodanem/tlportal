"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  getBroadcastCampaignProgress,
  processBroadcastCampaignNowAction,
} from "@/app/admin/broadcasts/campaign-actions";
import { broadcastCampaignStatusLabel, broadcastCampaignStatusTone } from "@/lib/broadcast/campaign-status";
import type { BroadcastCampaignStatus } from "@prisma/client";

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

export function BroadcastCampaignDetailClient({
  campaignId,
  initial,
}: {
  campaignId: string;
  initial: {
    status: BroadcastCampaignStatus;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
  };
}) {
  const router = useRouter();
  const [stats, setStats] = useState({ ...initial, pendingCount: initial.totalRecipients - initial.sentCount - initial.failedCount - initial.skippedCount });
  const [pending, startTransition] = useTransition();

  const inFlight = stats.status === "queued" || stats.status === "sending";

  const refresh = useCallback(async () => {
    const next = await getBroadcastCampaignProgress(campaignId);
    if (next) {
      setStats(next);
      if (next.status !== stats.status || next.sentCount !== stats.sentCount) {
        router.refresh();
      }
    }
  }, [campaignId, router, stats.sentCount, stats.status]);

  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [inFlight, refresh]);

  function processNow() {
    startTransition(async () => {
      await processBroadcastCampaignNowAction(campaignId);
      await refresh();
      router.refresh();
    });
  }

  const done = stats.sentCount + stats.failedCount + stats.skippedCount;
  const pct = stats.totalRecipients > 0 ? Math.round((done / stats.totalRecipients) * 100) : 0;
  const tone = broadcastCampaignStatusTone(stats.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(tone)}`}>
          {broadcastCampaignStatusLabel(stats.status)}
        </span>
        {inFlight ? (
          <button
            type="button"
            onClick={processNow}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {pending ? "Sending…" : "Send next batch now"}
          </button>
        ) : null}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            {stats.sentCount} sent · {stats.failedCount} failed · {stats.pendingCount} pending
            {stats.skippedCount > 0 ? ` · ${stats.skippedCount} skipped` : ""}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all duration-500 dark:bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
