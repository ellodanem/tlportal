"use server";

import { revalidatePath } from "next/cache";

import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_COMPANY_MAX,
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_NAME_MAX,
  parseFeedbackContact,
  parseFeedbackRating,
} from "@/lib/feedback/parse-contact";
import { prisma } from "@/lib/db";

import type { FeedbackFormState } from "./feedback-form-state";

export async function submitFeedback(
  _prev: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot) {
    return { ok: true, message: "Thanks — your feedback was received. Our team will review it." };
  }

  const body = String(formData.get("body") ?? "").trim();
  const displayNameRaw = String(formData.get("displayName") ?? "").trim();
  const companyNameRaw = String(formData.get("companyName") ?? "").trim();
  const contactRaw = String(formData.get("contact") ?? "").trim();
  const sharePermission =
    formData.get("sharePermission") === "on" || formData.get("sharePermission") === "true";
  const rating = parseFeedbackRating(String(formData.get("rating") ?? ""));

  if (!body) {
    return { ok: false, error: "Please write a short message." };
  }
  if (rating == null) {
    return { ok: false, error: "Please choose a rating from 1 to 5." };
  }
  if (body.length > FEEDBACK_BODY_MAX) {
    return { ok: false, error: `Keep your message under ${FEEDBACK_BODY_MAX} characters.` };
  }
  if (displayNameRaw.length > FEEDBACK_NAME_MAX) {
    return { ok: false, error: `Keep your name under ${FEEDBACK_NAME_MAX} characters.` };
  }
  if (companyNameRaw.length > FEEDBACK_COMPANY_MAX) {
    return { ok: false, error: `Keep your company name under ${FEEDBACK_COMPANY_MAX} characters.` };
  }
  if (contactRaw.length > FEEDBACK_CONTACT_MAX) {
    return { ok: false, error: "Email or phone is too long." };
  }
  if (!displayNameRaw) {
    return { ok: false, error: "Please add your name." };
  }

  const displayName = displayNameRaw || null;
  const companyName = companyNameRaw || null;
  const { email, phone } = parseFeedbackContact(contactRaw);

  let matchesCustomerId: string | null = null;
  if (email) {
    const byEmail = await prisma.customer.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    matchesCustomerId = byEmail?.id ?? null;
  }
  if (!matchesCustomerId && phone) {
    const byPhone = await prisma.customer.findFirst({
      where: { phone: { equals: phone, mode: "insensitive" } },
      select: { id: true },
    });
    matchesCustomerId = byPhone?.id ?? null;
  }

  try {
    await prisma.feedbackSubmission.create({
      data: {
        body,
        rating,
        displayName,
        companyName,
        email,
        phone,
        sharePermission,
        matchesCustomerId,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not submit feedback.";
    return { ok: false, error: message };
  }

  revalidatePath("/admin/feedback");

  return { ok: true, message: "Thanks — your feedback was received. Our team will review it." };
}
