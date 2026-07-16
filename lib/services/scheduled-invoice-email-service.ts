import "server-only";

import { applyFinalInvoiceNumberToEmailContent } from "@/lib/billing/invoice-email-body";
import { sendNativeInvoiceEmail } from "@/lib/billing/send-native-invoice-email";
import { formatScheduledSendLabel, parseScheduledSendDateInput } from "@/lib/billing/atlantic-date";
import { prisma } from "@/lib/db";

export type ScheduleInvoiceEmailInput = {
  invoiceId: string;
  sendDateYmd: string;
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  scheduledById?: string | null;
};

export async function scheduleInvoiceEmail(
  input: ScheduleInvoiceEmailInput,
): Promise<{ ok: true; sendAt: Date; label: string } | { error: string }> {
  const sendAt = parseScheduledSendDateInput(input.sendDateYmd);
  if ("error" in sendAt) {
    return { error: sendAt.error };
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduledInvoiceEmail.updateMany({
      where: { invoiceId: input.invoiceId, status: "pending" },
      data: { status: "cancelled" },
    });
    await tx.scheduledInvoiceEmail.create({
      data: {
        invoiceId: input.invoiceId,
        sendAt,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        bodyText: input.bodyText,
        scheduledById: input.scheduledById ?? null,
      },
    });
  });

  return { ok: true, sendAt, label: formatScheduledSendLabel(sendAt) };
}

export async function cancelPendingScheduledInvoiceEmail(invoiceId: string): Promise<
  { ok: true } | { error: string }
> {
  const result = await prisma.scheduledInvoiceEmail.updateMany({
    where: { invoiceId, status: "pending" },
    data: { status: "cancelled" },
  });
  if (result.count === 0) {
    return { error: "No scheduled send to cancel." };
  }
  return { ok: true };
}

export async function processDueScheduledInvoiceEmails(): Promise<{
  due: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();
  const dueRows = await prisma.scheduledInvoiceEmail.findMany({
    where: { status: "pending", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: 25,
  });

  let sent = 0;
  let failed = 0;

  for (const row of dueRows) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: row.invoiceId },
      select: { number: true },
    });
    const invoiceNumber = invoice?.number?.trim();
    const emailContent =
      invoiceNumber != null
        ? applyFinalInvoiceNumberToEmailContent(row.subject, row.bodyText, invoiceNumber)
        : { subject: row.subject, bodyText: row.bodyText };

    const result = await sendNativeInvoiceEmail({
      invoiceId: row.invoiceId,
      to: row.to,
      cc: row.cc.length ? row.cc : undefined,
      bcc: row.bcc.length ? row.bcc : undefined,
      subject: emailContent.subject,
      bodyText: emailContent.bodyText,
    });

    if ("ok" in result && result.ok) {
      sent += 1;
      await prisma.scheduledInvoiceEmail.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), lastError: null },
      });
    } else {
      failed += 1;
      await prisma.scheduledInvoiceEmail.update({
        where: { id: row.id },
        data: { status: "failed", lastError: "error" in result ? result.error : "Send failed." },
      });
    }
  }

  return { due: dueRows.length, sent, failed };
}
