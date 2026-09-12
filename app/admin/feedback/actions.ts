"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { FEEDBACK_ADMIN_NOTE_MAX } from "@/lib/feedback/parse-contact";
import { canFeatureFeedback } from "@/lib/feedback/share-copy";
import { isFeedbackStatus } from "@/lib/feedback/status";
import { prisma } from "@/lib/db";

export type FeedbackAdminActionState = { error: string | null; ok: boolean };

export const feedbackAdminActionInitial: FeedbackAdminActionState = { error: null, ok: false };

export async function updateFeedbackStatus(
  _prev: FeedbackAdminActionState,
  formData: FormData,
): Promise<FeedbackAdminActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in.", ok: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  if (!id || !isFeedbackStatus(statusRaw)) {
    return { error: "Invalid request.", ok: false };
  }

  const row = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { id: true, sharePermission: true },
  });
  if (!row) {
    return { error: "Feedback not found.", ok: false };
  }

  if (statusRaw === "featured" && !canFeatureFeedback(row.sharePermission)) {
    return { error: "This submission is private — it cannot be featured or copied for sharing.", ok: false };
  }

  await prisma.feedbackSubmission.update({
    where: { id },
    data: {
      status: statusRaw,
      reviewedAt: new Date(),
      reviewedById: session.sub,
    },
  });

  revalidatePath("/admin/feedback");
  revalidatePath(`/admin/feedback/${id}`);
  return { error: null, ok: true };
}

export async function saveFeedbackAdminNote(
  _prev: FeedbackAdminActionState,
  formData: FormData,
): Promise<FeedbackAdminActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in.", ok: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const adminNoteRaw = String(formData.get("adminNote") ?? "").trim();
  if (!id) {
    return { error: "Missing feedback id.", ok: false };
  }
  if (adminNoteRaw.length > FEEDBACK_ADMIN_NOTE_MAX) {
    return { error: `Keep the note under ${FEEDBACK_ADMIN_NOTE_MAX} characters.`, ok: false };
  }

  const exists = await prisma.feedbackSubmission.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return { error: "Feedback not found.", ok: false };
  }

  await prisma.feedbackSubmission.update({
    where: { id },
    data: {
      adminNote: adminNoteRaw || null,
      reviewedAt: new Date(),
      reviewedById: session.sub,
    },
  });

  revalidatePath("/admin/feedback");
  revalidatePath(`/admin/feedback/${id}`);
  return { error: null, ok: true };
}
