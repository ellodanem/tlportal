import "server-only";

import type { Customer, CustomerSubscription, ServiceAssignment } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import { opsUrgencyFromNextDueDate } from "@/lib/admin/assignment-ops-urgency";
import { getBroadcastSupportEmail } from "@/lib/broadcast/support-contact";
import { prisma } from "@/lib/db";
import { isSubscriptionAttentionStatus } from "@/lib/services/customer-subscription-service";
import { formatXcd } from "@/lib/subscription-options/display";
import {
  allowWhatsAppWithoutPayLink,
  billingReminderTimezone,
  getTwilioContentSid,
  isTwilioWhatsAppConfigured,
  type TwilioWhatsAppReminderTemplateKey,
} from "@/lib/twilio/config";
import { toWhatsAppAddress } from "@/lib/twilio/phone";
import { sendBillingWhatsAppTemplate } from "@/lib/twilio/whatsapp-send";

import { notifyAdminsMissingPayLink } from "./whatsapp-pay-link-admin-alert";
import { resolveBillingReminderPayLink } from "./whatsapp-reminder-pay-link";

export const BILLING_WHATSAPP_REMINDER_OFFSETS = {
  due_5d: 5,
  due_3d: 3,
  due_0d: 0,
  overdue_3d: -3,
  overdue_5d: -5,
} as const;

export type BillingWhatsAppReminderKind = keyof typeof BILLING_WHATSAPP_REMINDER_OFFSETS;

function ymdInTimezone(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

/** Calendar-day difference: dueYmd minus todayYmd (positive = due in future). */
export function calendarDaysUntilDue(nextDueDate: Date, now = new Date(), tz?: string): number {
  const zone = tz ?? billingReminderTimezone();
  const dueYmd = ymdInTimezone(nextDueDate, zone);
  const todayYmd = ymdInTimezone(now, zone);
  const dueMs = Date.parse(`${dueYmd}T12:00:00Z`);
  const todayMs = Date.parse(`${todayYmd}T12:00:00Z`);
  return Math.round((dueMs - todayMs) / 86_400_000);
}

function formatDueDateLabel(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, "d MMMM yyyy");
}

function customerGreetingName(customer: Pick<Customer, "firstName" | "lastName" | "company">): string {
  const first = customer.firstName?.trim();
  if (first) return first;
  const company = customer.company?.trim();
  if (company) return company;
  const full = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return full || "there";
}

async function resolveAmountDueLabel(
  customerId: string,
  customer: Pick<Customer, "stripeMonthlyRateXcd">,
  assignments: ServiceAssignment[],
): Promise<string> {
  const openInvoice = await prisma.billingInvoice.findFirst({
    where: {
      customerId,
      status: { in: ["open", "draft", "past_due", "uncollectible"] },
    },
    orderBy: { createdAt: "desc" },
    select: { amountXcd: true },
  });
  if (openInvoice) {
    return formatXcd(Number(openInvoice.amountXcd));
  }

  const months = assignments
    .map((a) => a.intervalMonths)
    .filter((m): m is number => m != null && m > 0);
  const termMonths = months.length > 0 ? Math.max(...months) : 1;
  const rate = customer.stripeMonthlyRateXcd ? Number(customer.stripeMonthlyRateXcd) : null;
  if (rate != null && rate > 0) {
    const activeDevices = Math.max(1, assignments.filter((a) => a.status !== "cancelled").length);
    return formatXcd(rate * termMonths * activeDevices);
  }

  return "See invoice";
}

function shouldSendPreDue(
  customer: Pick<Customer, "billingMode">,
  sub: CustomerSubscription | null,
): boolean {
  if (customer.billingMode === "manual_legacy") return true;
  if (!sub) return true;
  if (sub.status === "pending_payment") return true;
  if (isSubscriptionAttentionStatus(sub.status)) return true;
  if (sub.status === "active") {
    return false;
  }
  return true;
}

function shouldSendOverdue(
  customer: Pick<Customer, "billingMode">,
  sub: CustomerSubscription | null,
  assignments: ServiceAssignment[],
): boolean {
  if (customer.billingMode === "manual_legacy") return true;
  if (sub && isSubscriptionAttentionStatus(sub.status)) return true;
  return assignments.some((a) => opsUrgencyFromNextDueDate(a.nextDueDate) === "overdue");
}

function pickAnchorDueDate(assignments: ServiceAssignment[], targetDiff: number, tz: string, now: Date): Date | null {
  const matches = assignments.filter((a) => {
    if (!a.nextDueDate) return false;
    return calendarDaysUntilDue(a.nextDueDate, now, tz) === targetDiff;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.nextDueDate!.getTime() - b.nextDueDate!.getTime());
  return matches[0]!.nextDueDate!;
}

async function supportMailtoFallback(): Promise<string> {
  const email = await getBroadcastSupportEmail();
  return `mailto:${email}`;
}

export type ProcessBillingWhatsAppRemindersResult = {
  ok: boolean;
  at: string;
  timezone: string;
  configured: boolean;
  sent: number;
  skipped: number;
  failed: number;
  adminAlertsSent: number;
  details: Array<{ customerId: string; kind: BillingWhatsAppReminderKind; status: string; error?: string }>;
};

export async function processBillingWhatsAppReminders(
  now = new Date(),
): Promise<ProcessBillingWhatsAppRemindersResult> {
  const tz = billingReminderTimezone();
  const at = now.toISOString();
  const details: ProcessBillingWhatsAppRemindersResult["details"] = [];

  if (!isTwilioWhatsAppConfigured()) {
    return {
      ok: false,
      at,
      timezone: tz,
      configured: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      adminAlertsSent: 0,
      details: [{ customerId: "-", kind: "due_5d", status: "twilio_not_configured" }],
    };
  }

  const assignments = await prisma.serviceAssignment.findMany({
    where: {
      endDate: null,
      status: { notIn: ["cancelled", "suspended"] },
      nextDueDate: { not: null },
      customer: { phone: { not: null } },
    },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          phone: true,
          billingMode: true,
          stripeMonthlyRateXcd: true,
        },
      },
    },
  });

  const byCustomer = new Map<
    string,
    { customer: (typeof assignments)[0]["customer"]; assignments: ServiceAssignment[] }
  >();
  for (const a of assignments) {
    const phone = a.customer.phone?.trim();
    if (!phone) continue;
    const existing = byCustomer.get(a.customerId);
    if (existing) {
      existing.assignments.push(a);
    } else {
      byCustomer.set(a.customerId, { customer: a.customer, assignments: [a] });
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let adminAlertsSent = 0;

  for (const [customerId, group] of byCustomer) {
    const sub = await prisma.customerSubscription.findFirst({
      where: { customerId },
      orderBy: { updatedAt: "desc" },
    });

    for (const kind of Object.keys(BILLING_WHATSAPP_REMINDER_OFFSETS) as BillingWhatsAppReminderKind[]) {
      const targetDiff = BILLING_WHATSAPP_REMINDER_OFFSETS[kind];
      const isOverdue = targetDiff < 0;

      if (isOverdue) {
        if (!shouldSendOverdue(group.customer, sub, group.assignments)) {
          skipped += 1;
          details.push({ customerId, kind, status: "skipped_not_overdue" });
          continue;
        }
      } else if (!shouldSendPreDue(group.customer, sub)) {
        skipped += 1;
        details.push({ customerId, kind, status: "skipped_stripe_current" });
        continue;
      }

      const anchorDue = pickAnchorDueDate(group.assignments, targetDiff, tz, now);
      if (!anchorDue) {
        continue;
      }

      const dueYmd = ymdInTimezone(anchorDue, tz);
      const existing = await prisma.billingWhatsAppReminder.findUnique({
        where: {
          customerId_reminderKind_nextDueDate: {
            customerId,
            reminderKind: kind,
            nextDueDate: new Date(`${dueYmd}T12:00:00.000Z`),
          },
        },
      });
      if (existing) {
        skipped += 1;
        details.push({ customerId, kind, status: "already_sent" });
        continue;
      }

      if (!getTwilioContentSid(kind)) {
        skipped += 1;
        details.push({ customerId, kind, status: "skipped_no_template_sid" });
        continue;
      }

      const to = toWhatsAppAddress(group.customer.phone);
      if (!to) {
        skipped += 1;
        details.push({ customerId, kind, status: "skipped_invalid_phone" });
        continue;
      }

      const pay = await resolveBillingReminderPayLink(customerId);
      let payLink = pay.url;
      let payLinkSource = pay.source;

      if (!payLink) {
        if (allowWhatsAppWithoutPayLink()) {
          payLink = await supportMailtoFallback();
          payLinkSource = "support_mailto_fallback";
        } else {
          skipped += 1;
          const amountDueForAlert = await resolveAmountDueLabel(
            customerId,
            group.customer,
            group.assignments,
          );
          const alert = await notifyAdminsMissingPayLink({
            customerId,
            customer: group.customer,
            reminderKind: kind,
            nextDueDateYmd: dueYmd,
            dueDateLabel: formatDueDateLabel(anchorDue, tz),
            amountDueLabel: amountDueForAlert,
          });
          if (alert.notified) {
            adminAlertsSent += alert.recipientCount;
          }
          details.push({
            customerId,
            kind,
            status: alert.notified
              ? "skipped_no_pay_link_admin_notified"
              : alert.recipientCount === 0 && alert.errors.includes("no_admin_phones")
                ? "skipped_no_pay_link_no_admin_phones"
                : "skipped_no_pay_link",
            error: alert.errors.length > 0 ? alert.errors.join("; ") : undefined,
          });
          continue;
        }
      }

      const amountDue = await resolveAmountDueLabel(customerId, group.customer, group.assignments);
      const sendResult = await sendBillingWhatsAppTemplate(to, kind as TwilioWhatsAppReminderTemplateKey, {
        firstName: customerGreetingName(group.customer),
        dueDate: formatDueDateLabel(anchorDue, tz),
        amountDue,
        payLink: payLink!,
      });

      if (!sendResult.ok) {
        failed += 1;
        details.push({ customerId, kind, status: "failed", error: sendResult.error });
        continue;
      }

      await prisma.billingWhatsAppReminder.create({
        data: {
          customerId,
          reminderKind: kind,
          nextDueDate: new Date(`${dueYmd}T12:00:00.000Z`),
          twilioMessageSid: sendResult.messageSid,
          payLinkSource,
        },
      });

      sent += 1;
      details.push({ customerId, kind, status: "sent" });
    }
  }

  return {
    ok: true,
    at,
    timezone: tz,
    configured: true,
    sent,
    skipped,
    failed,
    adminAlertsSent,
    details,
  };
}
