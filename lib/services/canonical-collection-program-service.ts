import "server-only";

import { prisma } from "@/lib/db";
import { startOfUtcDay } from "@/lib/billing/recurring-period";
import { sendAppEmail } from "@/lib/email/send-mail";
import {
  COLLECTION_CARD_LINK_LEAD_DAYS,
  collectionCardLinkStartDate,
  collectionDailyAction,
  utcDayString,
} from "@/lib/domain/canonical-collection-program";
import {
  CanonicalStripeCardOnFileError,
  startStripeCardOnFileCheckout,
} from "@/lib/services/canonical-stripe-card-on-file-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { sendStripePaymentLinkWhatsApp } from "@/lib/billing/customer-whatsapp";
import { recordOutboundWhatsAppMessage } from "@/lib/communications/whatsapp-conversation-service";
import { getCheckoutEmailBcc } from "@/lib/stripe/checkout-email-recipients";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";
import { toSmsAddress, toWhatsAppAddress } from "@/lib/twilio/phone";
import { buildCanonicalStripeRateGroups } from "@/lib/domain/canonical-stripe-shadow";

export class CanonicalCollectionProgramError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalCollectionProgramError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new CanonicalCollectionProgramError(code, message);
}

function greetingName(customer: { company: string | null; firstName: string | null; lastName: string | null }): string {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "there";
}

async function loadArmedTarget(subscriptionId: string) {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: { select: { id: true, email: true, phone: true, company: true, firstName: true, lastName: true } },
      collectionProgram: true,
      providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } },
      items: { include: { rates: true } },
    },
  });
  if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  return subscription;
}

async function notifyCheckout(input: {
  customer: { id: string; email: string | null; phone: string | null; company: string | null; firstName: string | null; lastName: string | null };
  checkoutUrl: string;
  checkoutSessionId: string;
  kind: "card_on_file" | "pay_now";
  firstChargeDate: Date;
  billingIntervalMonths: number;
  recurringTotal: string;
  isResend: boolean;
}): Promise<string> {
  const amountLine = `${formatXcd(Number(input.recurringTotal))} per ${formatPlanTerm(input.billingIntervalMonths)}`;
  const firstCharge = utcDayString(input.firstChargeDate);
  const name = greetingName(input.customer);
  const subject = input.kind === "pay_now"
    ? "Complete your Track Lucia subscription payment"
    : "Save your Track Lucia card for the upcoming charge";
  const intro = input.kind === "pay_now"
    ? `Your Track Lucia subscription is due. Use the link below to save your card and pay ${amountLine} now.`
    : `Please save a card for your Track Lucia subscription. The first charge is ${amountLine} on ${firstCharge}, not today.`;
  const parts: string[] = [];

  if (input.customer.email?.trim()) {
    const sent = await sendAppEmail({
      to: input.customer.email.trim(),
      bcc: getCheckoutEmailBcc(),
      subject,
      text: `Hello ${name},\n\n${intro}\n\n${input.checkoutUrl}\n\nThis link is valid for about 24 hours.\n\n— Track Lucia`,
      html: `<p>Hello ${name},</p><p>${intro}</p><p><a href="${input.checkoutUrl}">Open Checkout</a></p><p>This link is valid for about 24 hours.</p><p>— Track Lucia</p>`,
    });
    if (sent.ok) parts.push(`email to ${input.customer.email.trim()}`);
    else parts.push(`email failed (${sent.error})`);
  }

  if (toWhatsAppAddress(input.customer.phone)) {
    const wa = await sendStripePaymentLinkWhatsApp({
      customer: input.customer,
      paymentUrl: input.checkoutUrl,
      checkoutSessionId: input.checkoutSessionId,
      amountLine,
      durationMonths: input.billingIntervalMonths,
      isResend: input.isResend,
    });
    if (wa.ok) {
      parts.push("WhatsApp");
      const phone = toSmsAddress(input.customer.phone);
      if (phone) {
        await recordOutboundWhatsAppMessage({
          phoneE164: phone,
          body: `[template:stripe_payment_link] ${amountLine} · ${input.checkoutUrl}`,
          messageSid: wa.messageSid,
          kind: "template",
        });
      }
    } else {
      parts.push(`WhatsApp failed (${wa.error})`);
    }
  }

  return parts.length ? parts.join("; ") : "Checkout created. Add an email or mobile number to send it automatically.";
}

async function recurringTotalFor(subscriptionId: string, nextBillingDate: Date): Promise<string> {
  const configuration = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: { items: { include: { rates: true } } },
  });
  if (!configuration) return "0.00";
  return buildCanonicalStripeRateGroups(
    { ...configuration, collectionMethod: "stripe_autocharge" },
    nextBillingDate,
    { requireActive: false },
  ).expectedRecurringTotal.toFixed(2);
}

export async function armCollectionProgram(input: {
  subscriptionId: string;
  staffUserId: string;
}): Promise<{ sentNow: boolean; action: string; checkoutUrl: string | null }> {
  const subscription = await loadArmedTarget(input.subscriptionId);
  if (subscription.controlMode !== "canonical") fail("NOT_CANONICAL", "Only a subscription workspace agreement can use Collection.");
  if (subscription.collectionMethod !== "stripe_autocharge") fail("NOT_CARD_BILLING", "Set collection to automatic card billing first.");
  if (!subscription.nextBillingDate) fail("NEXT_BILLING_DATE_REQUIRED", "Set the first charge date before arming Collection.");
  if (subscription.providerLinks.length) fail("ALREADY_LINKED", "This subscription already has a card on file.");
  if (subscription.collectionProgram?.status === "armed") fail("ALREADY_ARMED", "Collection is already waiting to send Checkout.");

  const now = new Date();
  const program = await prisma.subscriptionCollectionProgram.upsert({
    where: { customerSubscriptionId: subscription.id },
    create: {
      customerSubscriptionId: subscription.id,
      customerId: subscription.customerId,
      status: "armed",
      firstChargeDate: startOfUtcDay(subscription.nextBillingDate),
      leadDays: COLLECTION_CARD_LINK_LEAD_DAYS,
      armedById: input.staffUserId,
      armedAt: now,
    },
    update: {
      status: "armed",
      firstChargeDate: startOfUtcDay(subscription.nextBillingDate),
      leadDays: COLLECTION_CARD_LINK_LEAD_DAYS,
      lastCardLinkSentOn: null,
      lastPayNowSentOn: null,
      lastCheckoutKind: null,
      lastCheckoutUrl: null,
      lastCheckoutSessionId: null,
      lastNotifySummary: null,
      armedById: input.staffUserId,
      armedAt: now,
      canceledAt: null,
      completedAt: null,
    },
  });

  await recordOperationalEvent({
    category: "subscription.collection_program_armed",
    summary: `Collection armed. Card-on-file Checkout starts ${utcDayString(collectionCardLinkStartDate(subscription.nextBillingDate))}.`,
    customerId: subscription.customerId,
    actorUserId: input.staffUserId,
    payload: { subscriptionId: subscription.id, firstChargeDate: utcDayString(subscription.nextBillingDate) },
  });

  const action = collectionDailyAction({
    today: now,
    firstChargeDate: subscription.nextBillingDate,
    status: "armed",
    hasOpenStripeLink: false,
    lastCardLinkSentOn: program.lastCardLinkSentOn,
    lastPayNowSentOn: program.lastPayNowSentOn,
  });
  if (action === "send_card_on_file" || action === "send_pay_now") {
    const sent = await runCollectionSend(subscription.id, action, input.staffUserId);
    return { sentNow: true, action, checkoutUrl: sent.checkoutUrl };
  }
  return { sentNow: false, action: "none", checkoutUrl: null };
}

export async function cancelCollectionProgram(input: { subscriptionId: string; staffUserId: string }): Promise<void> {
  const subscription = await loadArmedTarget(input.subscriptionId);
  if (subscription.collectionProgram?.status !== "armed") fail("NOT_ARMED", "There is no armed Collection program to cancel.");
  if (subscription.providerLinks.length) fail("ALREADY_LINKED", "A card is already on file, so Collection has finished.");
  await prisma.subscriptionCollectionProgram.update({
    where: { id: subscription.collectionProgram.id },
    data: { status: "canceled", canceledAt: new Date() },
  });
  await recordOperationalEvent({
    category: "subscription.collection_program_canceled",
    summary: "Collection program canceled. No further Checkout links will be sent automatically.",
    customerId: subscription.customerId,
    actorUserId: input.staffUserId,
    payload: { subscriptionId: subscription.id },
  });
}

async function runCollectionSend(
  subscriptionId: string,
  action: "send_card_on_file" | "send_pay_now",
  staffUserId?: string | null,
): Promise<{ checkoutUrl: string }> {
  const subscription = await loadArmedTarget(subscriptionId);
  if (!subscription.nextBillingDate) fail("NEXT_BILLING_DATE_REQUIRED", "Set the first charge date first.");
  const kind = action === "send_pay_now" ? "pay_now" as const : "card_on_file" as const;
  const sendDay = utcDayString(new Date());
  let checkout;
  try {
    checkout = await startStripeCardOnFileCheckout({
      subscriptionId,
      staffUserId,
      confirmCancelExisting: false,
      kind,
      sendDay,
    });
  } catch (error) {
    if (error instanceof CanonicalStripeCardOnFileError) fail(error.code, error.message);
    throw error;
  }

  const total = await recurringTotalFor(subscriptionId, subscription.nextBillingDate);
  const notifySummary = await notifyCheckout({
    customer: subscription.customer,
    checkoutUrl: checkout.checkoutUrl,
    checkoutSessionId: checkout.checkoutSessionId,
    kind,
    firstChargeDate: subscription.nextBillingDate,
    billingIntervalMonths: subscription.billingIntervalMonths ?? 1,
    recurringTotal: total,
    isResend: Boolean(kind === "card_on_file" ? subscription.collectionProgram?.lastCardLinkSentOn : subscription.collectionProgram?.lastPayNowSentOn),
  });

  if (subscription.collectionProgram) {
    await prisma.subscriptionCollectionProgram.update({
      where: { id: subscription.collectionProgram.id },
      data: {
        firstChargeDate: startOfUtcDay(subscription.nextBillingDate),
        lastCheckoutKind: kind,
        lastCheckoutUrl: checkout.checkoutUrl,
        lastCheckoutSessionId: checkout.checkoutSessionId,
        lastNotifySummary: notifySummary,
        ...(kind === "pay_now"
          ? { lastPayNowSentOn: startOfUtcDay(new Date()) }
          : { lastCardLinkSentOn: startOfUtcDay(new Date()) }),
      },
    });
  }

  return { checkoutUrl: checkout.checkoutUrl };
}

export async function processCanonicalCollectionPrograms(now = new Date()): Promise<{
  scanned: number;
  sentCardOnFile: number;
  sentPayNow: number;
  completed: number;
  errors: number;
}> {
  const programs = await prisma.subscriptionCollectionProgram.findMany({
    where: { status: "armed" },
    include: {
      customerSubscription: {
        select: {
          id: true,
          nextBillingDate: true,
          providerLinks: { where: { provider: "stripe", endedAt: null }, select: { id: true } },
        },
      },
    },
  });

  const result = { scanned: programs.length, sentCardOnFile: 0, sentPayNow: 0, completed: 0, errors: 0 };
  for (const program of programs) {
    const firstCharge = program.customerSubscription.nextBillingDate ?? program.firstChargeDate;
    const action = collectionDailyAction({
      today: now,
      firstChargeDate: firstCharge,
      status: program.status,
      hasOpenStripeLink: program.customerSubscription.providerLinks.length > 0,
      lastCardLinkSentOn: program.lastCardLinkSentOn,
      lastPayNowSentOn: program.lastPayNowSentOn,
      leadDays: program.leadDays,
    });
    try {
      if (action === "complete") {
        await prisma.subscriptionCollectionProgram.update({
          where: { id: program.id },
          data: { status: "completed", completedAt: new Date() },
        });
        result.completed += 1;
        continue;
      }
      if (action === "send_card_on_file" || action === "send_pay_now") {
        await runCollectionSend(program.customerSubscription.id, action, null);
        if (action === "send_card_on_file") result.sentCardOnFile += 1;
        else result.sentPayNow += 1;
      }
    } catch (error) {
      result.errors += 1;
      await prisma.subscriptionCollectionProgram.update({
        where: { id: program.id },
        data: { lastNotifySummary: error instanceof Error ? error.message : "Collection send failed." },
      });
    }
  }
  return result;
}
