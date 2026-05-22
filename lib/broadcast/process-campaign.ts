import "server-only";

import type { BroadcastCampaignStatus } from "@prisma/client";

import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";
import { sendAppEmail } from "@/lib/email/send-mail";

import type { BroadcastIncidentFields } from "./customer-merge";
import { mergeValuesForRecipient } from "./customer-merge";
import { broadcastBodyToEmailParts } from "./merge-fields";
import type { BroadcastRecipient } from "./audience";

const DEFAULT_BATCH_SIZE = 25;

function terminalStatus(sent: number, failed: number, pending: number): BroadcastCampaignStatus {
  if (pending > 0) return "sending";
  if (failed > 0 && sent > 0) return "completed_with_errors";
  if (failed > 0 && sent === 0) return "failed";
  return "completed";
}

async function refreshCampaignStats(campaignId: string): Promise<void> {
  const [sent, failed, skipped, pending, campaign] = await Promise.all([
    prisma.broadcastDelivery.count({ where: { campaignId, status: "sent" } }),
    prisma.broadcastDelivery.count({ where: { campaignId, status: "failed" } }),
    prisma.broadcastDelivery.count({ where: { campaignId, status: "skipped" } }),
    prisma.broadcastDelivery.count({ where: { campaignId, status: "pending" } }),
    prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true, startedAt: true },
    }),
  ]);

  if (!campaign || campaign.status === "cancelled") {
    return;
  }

  const nextStatus = terminalStatus(sent, failed, pending);
  const now = new Date();

  await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      status: nextStatus,
      startedAt: campaign.startedAt ?? (sent + failed > 0 ? now : undefined),
      completedAt: pending === 0 ? now : null,
    },
  });
}

export type ProcessBroadcastBatchResult = {
  campaignId: string;
  processed: number;
  sent: number;
  failed: number;
  pending: number;
  status: BroadcastCampaignStatus;
};

export async function processBroadcastCampaignBatch(
  campaignId: string,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<ProcessBroadcastBatchResult | { error: string }> {
  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      subjectSnapshot: true,
      bodyTextSnapshot: true,
      incidentTitle: true,
      incidentStatus: true,
      incidentEta: true,
    },
  });

  if (!campaign) {
    return { error: "Campaign not found." };
  }
  if (campaign.status === "cancelled" || campaign.status === "completed") {
    const pending = await prisma.broadcastDelivery.count({
      where: { campaignId, status: "pending" },
    });
    return {
      campaignId,
      processed: 0,
      sent: await prisma.broadcastDelivery.count({ where: { campaignId, status: "sent" } }),
      failed: await prisma.broadcastDelivery.count({ where: { campaignId, status: "failed" } }),
      pending,
      status: campaign.status,
    };
  }

  if (campaign.status === "queued") {
    await prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: { status: "sending", startedAt: new Date() },
    });
  }

  const incident: BroadcastIncidentFields = {
    incidentTitle: campaign.incidentTitle,
    incidentStatus: campaign.incidentStatus,
    incidentEta: campaign.incidentEta,
  };

  const pendingRows = await prisma.broadcastDelivery.findMany({
    where: { campaignId, status: "pending" },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: {
      customer: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
        },
      },
    },
  });

  let batchSent = 0;
  let batchFailed = 0;

  for (const row of pendingRows) {
    const email = row.email.trim();
    if (!email) {
      await prisma.broadcastDelivery.update({
        where: { id: row.id },
        data: { status: "skipped", error: "No email address." },
      });
      continue;
    }

    const recipient: BroadcastRecipient = {
      customerId: row.customerId,
      email,
      firstName: row.customer.firstName,
      lastName: row.customer.lastName,
      company: row.customer.company,
      displayName: customerDisplayName(row.customer),
    };

    const merge = await mergeValuesForRecipient(recipient, incident);
    const parts = broadcastBodyToEmailParts(campaign.subjectSnapshot, campaign.bodyTextSnapshot, merge);

    const result = await sendAppEmail({
      to: email,
      subject: parts.subject,
      text: parts.text,
      html: parts.html,
    });

    if (result.ok) {
      batchSent += 1;
      await prisma.broadcastDelivery.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), error: null },
      });
    } else {
      batchFailed += 1;
      await prisma.broadcastDelivery.update({
        where: { id: row.id },
        data: { status: "failed", error: result.error.slice(0, 500) },
      });
    }
  }

  await refreshCampaignStats(campaignId);

  const [sent, failed, pending, updated] = await Promise.all([
    prisma.broadcastDelivery.count({ where: { campaignId, status: "sent" } }),
    prisma.broadcastDelivery.count({ where: { campaignId, status: "failed" } }),
    prisma.broadcastDelivery.count({ where: { campaignId, status: "pending" } }),
    prisma.broadcastCampaign.findUnique({ where: { id: campaignId }, select: { status: true } }),
  ]);

  return {
    campaignId,
    processed: pendingRows.length,
    sent,
    failed,
    pending,
    status: updated?.status ?? "sending",
  };
}

/** Process pending deliveries for all in-flight campaigns (cron). */
export async function processInFlightBroadcastCampaigns(batchSize = DEFAULT_BATCH_SIZE): Promise<{
  campaigns: ProcessBroadcastBatchResult[];
}> {
  const campaigns = await prisma.broadcastCampaign.findMany({
    where: { status: { in: ["queued", "sending"] } },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true },
  });

  const results: ProcessBroadcastBatchResult[] = [];
  for (const c of campaigns) {
    const r = await processBroadcastCampaignBatch(c.id, batchSize);
    if ("error" in r) continue;
    results.push(r);
  }
  return { campaigns: results };
}
