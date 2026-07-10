"use server";

import { revalidatePath } from "next/cache";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { invoiceEmailHtmlFromText } from "@/lib/billing/invoice-email-body";
import { sendAppEmail } from "@/lib/email/send-mail";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

export type QuickEmailState = {
  error: string | null;
  ok?: boolean;
  message?: string;
};

export async function sendQuickEmailAction(
  _prev: QuickEmailState,
  formData: FormData,
): Promise<QuickEmailState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!customerId) return { error: "Choose a customer." };
  if (!subject) return { error: "Enter a subject." };
  if (!body) return { error: "Enter a message." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, email: true, company: true, firstName: true, lastName: true },
  });
  const email = customer?.email?.trim();
  if (!customer || !email) {
    return { error: "That customer has no email on file." };
  }

  const sent = await sendAppEmail({
    to: email,
    subject,
    text: body,
    html: invoiceEmailHtmlFromText(body),
  });
  if (!sent.ok) {
    return { error: sent.error };
  }

  await recordOperationalEvent({
    category: "communication.message_sent",
    customerId: customer.id,
    actorUserId: session.sub,
    summary: `Email sent to ${email}: ${subject}`,
    payload: { channel: "email", to: email, subject },
  });

  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath("/admin/message-templates");
  return {
    error: null,
    ok: true,
    message: `Email sent to ${customerDisplayName(customer)} (${email}).`,
  };
}
