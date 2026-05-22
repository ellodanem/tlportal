"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { broadcastBodyToEmailParts } from "@/lib/broadcast/merge-fields";
import { parseBroadcastCategory } from "@/lib/broadcast/template-labels";
import { getBroadcastSampleMergeValues } from "@/lib/broadcast/support-contact";
import { getSession } from "@/lib/auth/get-session";
import { sendAppEmail } from "@/lib/email/send-mail";
import { prisma } from "@/lib/db";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

export type BroadcastTemplateFormState = { error: string | null; ok?: boolean };

export type BroadcastTemplateTestState = { error: string | null; message?: string };

function revalidateBroadcastPaths() {
  revalidatePath("/admin/broadcasts");
}

function readTemplateFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const category = parseBroadcastCategory(formData.get("category"));
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";
  return { name, subject, bodyText, category, isActive };
}

function validateTemplateFields(fields: ReturnType<typeof readTemplateFields>): string | null {
  if (!fields.name) return "Name is required.";
  if (!fields.subject) return "Subject is required.";
  if (!fields.bodyText) return "Message body is required.";
  if (fields.subject.length > 200) return "Subject must be 200 characters or fewer.";
  if (fields.bodyText.length > 20_000) return "Message body is too long.";
  return null;
}

export async function createBroadcastTemplate(
  _prev: BroadcastTemplateFormState,
  formData: FormData,
): Promise<BroadcastTemplateFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const fields = readTemplateFields(formData);
  const validationError = validateTemplateFields(fields);
  if (validationError) {
    return { error: validationError };
  }

  const maxOrder = await prisma.broadcastTemplate.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 10;

  const row = await prisma.broadcastTemplate.create({
    data: {
      name: fields.name,
      subject: fields.subject,
      bodyText: fields.bodyText,
      category: fields.category,
      isActive: fields.isActive,
      isSystem: false,
      sortOrder,
    },
    select: { id: true },
  });

  revalidateBroadcastPaths();
  redirect(`/admin/broadcasts/templates/${row.id}/edit`);
}

export async function updateBroadcastTemplate(
  _prev: BroadcastTemplateFormState,
  formData: FormData,
): Promise<BroadcastTemplateFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing template id." };
  }

  const fields = readTemplateFields(formData);
  const validationError = validateTemplateFields(fields);
  if (validationError) {
    return { error: validationError };
  }

  const existing = await prisma.broadcastTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return { error: "Template not found." };
  }

  await prisma.broadcastTemplate.update({
    where: { id },
    data: {
      name: fields.name,
      subject: fields.subject,
      bodyText: fields.bodyText,
      category: fields.category,
      isActive: fields.isActive,
    },
  });

  revalidateBroadcastPaths();
  revalidatePath(`/admin/broadcasts/templates/${id}/edit`);
  return { error: null, ok: true };
}

export async function deleteBroadcastTemplate(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    return;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const row = await prisma.broadcastTemplate.findUnique({
    where: { id },
    select: { isSystem: true, name: true },
  });
  if (!row || row.isSystem) {
    return;
  }

  await prisma.broadcastTemplate.delete({ where: { id } });
  await recordOperationalEvent({
    category: "staff.note",
    summary: `Deleted broadcast template “${row.name}”.`,
    actorUserId: session.sub,
  });

  revalidateBroadcastPaths();
  redirect("/admin/broadcasts");
}

export async function sendBroadcastTemplateTestEmail(
  _prev: BroadcastTemplateTestState,
  formData: FormData,
): Promise<BroadcastTemplateTestState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const testTo = String(formData.get("testTo") ?? "").trim() || session.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
    return { error: "Enter a valid test recipient email." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  if (!subject || !bodyText) {
    return { error: "Subject and message body are required for a test send." };
  }

  const merge = await getBroadcastSampleMergeValues();
  const parts = broadcastBodyToEmailParts(subject, bodyText, merge);

  const sent = await sendAppEmail({
    to: testTo,
    subject: `[Test] ${parts.subject}`,
    text: parts.text,
    html: parts.html,
  });

  if (!sent.ok) {
    return { error: sent.error };
  }

  const templateId = String(formData.get("id") ?? "").trim();
  if (templateId) {
    await recordOperationalEvent({
      category: "staff.note",
      summary: `Sent broadcast template test email to ${testTo}.`,
      actorUserId: session.sub,
      payload: { templateId, testTo },
    });
  }

  return {
    error: null,
    message: `Test email sent to ${testTo}. Merge fields were filled with sample data.`,
  };
}
