import "server-only";

import type { Customer } from "@prisma/client";

import type { BillingWhatsAppReminderKind } from "@/lib/billing/whatsapp-reminders";
import { getBillingAlertSmsRecipients } from "@/lib/billing/billing-alert-phones";
import { prisma } from "@/lib/db";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { sendTwilioAdminSms } from "@/lib/twilio/admin-sms";
import { getAppBaseUrl } from "@/lib/stripe/app-url";

function customerDisplayName(customer: Pick<Customer, "firstName" | "lastName" | "company">): string {
  const company = customer.company?.trim();
  if (company) return company;
  const person = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return person || "Customer";
}

function reminderKindLabel(kind: BillingWhatsAppReminderKind): string {
  switch (kind) {
    case "due_5d":
      return "5 days before due";
    case "due_3d":
      return "3 days before due";
    case "due_0d":
      return "due today";
    case "overdue_3d":
      return "3 days overdue";
    case "overdue_5d":
      return "5 days overdue";
    default:
      return kind;
  }
}

export type NotifyMissingPayLinkInput = {
  customerId: string;
  customer: Pick<Customer, "firstName" | "lastName" | "company" | "phone">;
  reminderKind: BillingWhatsAppReminderKind;
  nextDueDateYmd: string;
  dueDateLabel: string;
  amountDueLabel: string;
};

export type NotifyMissingPayLinkResult = {
  notified: boolean;
  recipientCount: number;
  errors: string[];
  alreadyNotified: boolean;
};

/**
 * SMS staff numbers from Settings when a customer WhatsApp was skipped (no pay link).
 * Idempotent per customer × reminder kind × due date.
 */
export async function notifyAdminsMissingPayLink(
  input: NotifyMissingPayLinkInput,
): Promise<NotifyMissingPayLinkResult> {
  const dueAnchor = new Date(`${input.nextDueDateYmd}T12:00:00.000Z`);

  const existing = await prisma.billingPayLinkAdminAlert.findUnique({
    where: {
      customerId_reminderKind_nextDueDate: {
        customerId: input.customerId,
        reminderKind: input.reminderKind,
        nextDueDate: dueAnchor,
      },
    },
  });
  if (existing) {
    return { notified: false, recipientCount: 0, errors: [], alreadyNotified: true };
  }

  const recipients = await getBillingAlertSmsRecipients();
  if (recipients.length === 0) {
    await recordOperationalEvent({
      category: "billing",
      customerId: input.customerId,
      summary: `Billing WhatsApp skipped (no pay link); no staff alert phones configured.`,
      payload: {
        reminderKind: input.reminderKind,
        nextDueDate: input.nextDueDateYmd,
      },
    });
    return { notified: false, recipientCount: 0, errors: ["no_admin_phones"], alreadyNotified: false };
  }

  const base = getAppBaseUrl();
  const billingUrl = `${base}/admin/customers/${input.customerId}/billing`;
  const name = customerDisplayName(input.customer);
  const phone = input.customer.phone?.trim() || "—";

  const body = [
    "AUTOMATED — TL Portal",
    "",
    "Customer billing WhatsApp was NOT sent: no pay link found.",
    "",
    `Customer: ${name}`,
    `Timing: ${reminderKindLabel(input.reminderKind)}`,
    `Due: ${input.dueDateLabel}`,
    `Amount: ${input.amountDueLabel}`,
    `Customer phone: ${phone}`,
    "",
    `Add a pay link, then open: ${billingUrl}`,
  ].join("\n");

  const errors: string[] = [];
  let sentCount = 0;

  for (const to of recipients) {
    const result = await sendTwilioAdminSms(to, body);
    if (result.ok) {
      sentCount += 1;
    } else {
      errors.push(`${to}: ${result.error}`);
    }
  }

  if (sentCount > 0) {
    await prisma.billingPayLinkAdminAlert.create({
      data: {
        customerId: input.customerId,
        reminderKind: input.reminderKind,
        nextDueDate: dueAnchor,
      },
    });
  }

  await recordOperationalEvent({
    category: "billing",
    customerId: input.customerId,
    summary:
      sentCount > 0
        ? `Staff SMS: missing pay link for ${reminderKindLabel(input.reminderKind)} (${sentCount} recipient${sentCount === 1 ? "" : "s"}).`
        : `Billing WhatsApp skipped (no pay link); staff SMS failed.`,
    payload: {
      reminderKind: input.reminderKind,
      nextDueDate: input.nextDueDateYmd,
      recipientCount: sentCount,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  return {
    notified: sentCount > 0,
    recipientCount: sentCount,
    errors,
    alreadyNotified: false,
  };
}
