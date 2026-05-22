"use server";

import type { BroadcastCampaignStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBroadcastAudiencePreview, resolveBroadcastRecipients } from "@/lib/broadcast/audience";
import { processBroadcastCampaignBatch } from "@/lib/broadcast/process-campaign";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

export type BroadcastAudiencePreviewState = {
  error: string | null;
  recipientCount?: number;
  skippedNoEmail?: number;
  duplicateEmailsCollapsed?: number;
};

export type CreateBroadcastCampaignState = { error: string | null };

export async function previewBroadcastAudienceAction(
  _prev: BroadcastAudiencePreviewState,
  formData: FormData,
): Promise<BroadcastAudiencePreviewState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const includeInactive = formData.get("includeInactive") === "on" || formData.get("includeInactive") === "true";
  const preview = await getBroadcastAudiencePreview(includeInactive);
  return { error: null, ...preview };
}

export async function createBroadcastCampaign(
  _prev: CreateBroadcastCampaignState,
  formData: FormData,
): Promise<CreateBroadcastCampaignState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "SEND") {
    return { error: 'Type SEND in the confirmation box to start this broadcast.' };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim() || null;
  const includeInactive = formData.get("includeInactive") === "on" || formData.get("includeInactive") === "true";
  const incidentTitle = String(formData.get("incidentTitle") ?? "").trim() || null;
  const incidentStatus = String(formData.get("incidentStatus") ?? "").trim() || null;
  const incidentEta = String(formData.get("incidentEta") ?? "").trim() || null;

  if (!subject) return { error: "Subject is required." };
  if (!bodyText) return { error: "Message body is required." };

  const { recipients, preview } = await resolveBroadcastRecipients(includeInactive);
  if (recipients.length === 0) {
    return {
      error: includeInactive
        ? "No customers with a valid email address."
        : "No active customers with a valid email address. Try including inactive customers.",
    };
  }

  const campaign = await prisma.$transaction(async (tx) => {
    const row = await tx.broadcastCampaign.create({
      data: {
        templateId,
        subjectSnapshot: subject,
        bodyTextSnapshot: bodyText,
        includeInactive,
        incidentTitle,
        incidentStatus,
        incidentEta,
        status: "queued",
        totalRecipients: recipients.length,
        actorUserId: session.sub,
      },
    });

    await tx.broadcastDelivery.createMany({
      data: recipients.map((r) => ({
        campaignId: row.id,
        customerId: r.customerId,
        email: r.email,
        status: "pending" as const,
      })),
    });

    return row;
  });

  await recordOperationalEvent({
    category: "broadcast.sent",
    summary: `Started broadcast to ${recipients.length} recipient(s): “${subject}”.`,
    actorUserId: session.sub,
    payload: {
      campaignId: campaign.id,
      includeInactive,
      skippedNoEmail: preview.skippedNoEmail,
      duplicateEmailsCollapsed: preview.duplicateEmailsCollapsed,
    },
  });

  await processBroadcastCampaignBatch(campaign.id, 25);

  revalidatePath("/admin/broadcasts");
  revalidatePath(`/admin/broadcasts/${campaign.id}`);
  redirect(`/admin/broadcasts/${campaign.id}`);
}

export async function processBroadcastCampaignNowAction(campaignId: string): Promise<{ error: string | null }> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = campaignId.trim();
  if (!id) return { error: "Missing campaign id." };

  const result = await processBroadcastCampaignBatch(id, 25);
  if ("error" in result) {
    return { error: result.error };
  }

  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id },
    select: { status: true, subjectSnapshot: true, sentCount: true, failedCount: true, totalRecipients: true },
  });

  if (campaign && (campaign.status === "completed" || campaign.status === "completed_with_errors")) {
    await recordOperationalEvent({
      category: "broadcast.completed",
      summary: `Broadcast finished: ${campaign.sentCount}/${campaign.totalRecipients} sent (${campaign.failedCount} failed) — “${campaign.subjectSnapshot}”.`,
      actorUserId: session.sub,
      payload: { campaignId: id },
    });
  }

  revalidatePath("/admin/broadcasts");
  revalidatePath(`/admin/broadcasts/${id}`);
  return { error: null };
}

export type BroadcastCampaignProgress = {
  id: string;
  status: BroadcastCampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
};

export async function getBroadcastCampaignProgress(campaignId: string): Promise<BroadcastCampaignProgress | null> {
  const session = await getSession();
  if (!session) return null;

  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      totalRecipients: true,
      sentCount: true,
      failedCount: true,
      skippedCount: true,
    },
  });
  if (!campaign) return null;

  const pendingCount = await prisma.broadcastDelivery.count({
    where: { campaignId, status: "pending" },
  });

  return { ...campaign, pendingCount };
}
