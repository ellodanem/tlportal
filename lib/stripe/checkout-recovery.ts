import "server-only";

import type Stripe from "stripe";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";
import { sendAppEmail } from "@/lib/email/send-mail";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

import { checkoutRecoveryEmailBody } from "./checkout-messaging";

export async function hasCheckoutRecoveryBeenSent(
  customerId: string,
  checkoutSessionId: string,
): Promise<boolean> {
  const row = await prisma.operationalEvent.findFirst({
    where: {
      customerId,
      category: "billing.checkout_recovery_sent",
      payload: {
        path: ["checkoutSessionId"],
        equals: checkoutSessionId,
      },
    },
    select: { id: true },
  });
  return row != null;
}

/**
 * On checkout.session.expired: email customer Stripe's recovery URL (if enabled).
 */
export async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const tlCustomerId = session.metadata?.tl_customer_id?.trim();
  if (!tlCustomerId) {
    return;
  }

  const recoveryUrl = session.after_expiration?.recovery?.url?.trim();
  if (!recoveryUrl) {
    await recordOperationalEvent({
      category: "billing.synced",
      summary: "Checkout expired (no recovery URL — enable recovery on session create)",
      customerId: tlCustomerId,
      payload: { checkoutSessionId: session.id },
    });
    return;
  }

  // If we minted a stable `/pay/go/{token}` redirect for this checkout session,
  // repoint it to the Stripe recovery URL so old WhatsApp buttons still work.
  try {
    const linkRow = await prisma.operationalEvent.findFirst({
      where: {
        customerId: tlCustomerId,
        category: "billing.checkout_payment_link",
        payload: { path: ["checkoutSessionId"], equals: session.id },
      },
      orderBy: { occurredAt: "desc" },
      select: { payload: true },
    });
    const payload = linkRow?.payload as
      | { payLinkToken?: unknown; planKey?: unknown }
      | null
      | undefined;
    const payLinkToken = payload?.payLinkToken;
    const planKey = payload?.planKey;
    if (typeof payLinkToken === "string" && payLinkToken.trim() && typeof planKey === "string" && planKey.trim()) {
      await recordOperationalEvent({
        category: "billing.checkout_payment_link",
        summary: "Checkout pay link destination set to recovery",
        customerId: tlCustomerId,
        payload: {
          planKey,
          payLinkToken,
          checkoutSessionId: session.id,
          payUrl: recoveryUrl,
        },
      });
    }
  } catch {
    // Non-fatal: if we can't repoint the stable token, the webhook email still goes out.
  }

  if (await hasCheckoutRecoveryBeenSent(tlCustomerId, session.id)) {
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: tlCustomerId },
    select: { email: true, company: true, firstName: true, lastName: true },
  });
  if (!customer) {
    return;
  }

  const greetingName = customerDisplayName(customer);
  const email = customer.email?.trim();
  let emailSent = false;
  let emailError: string | null = null;

  if (email) {
    const body = checkoutRecoveryEmailBody({ greetingName, recoveryUrl });
    const sent = await sendAppEmail({
      to: email,
      subject: "Your Track Lucia payment link expired — complete subscription",
      text: body.text,
      html: body.html,
    });
    if (sent.ok) {
      emailSent = true;
    } else {
      emailError = sent.error;
    }
  } else {
    emailError = "Customer has no email on file.";
  }

  await recordOperationalEvent({
    category: "billing.checkout_recovery_sent",
    summary: emailSent
      ? `Recovery payment link emailed to ${email}`
      : `Checkout expired — recovery link ready (email not sent: ${emailError})`,
    customerId: tlCustomerId,
    payload: {
      checkoutSessionId: session.id,
      recoveryUrl,
      emailSent,
      emailError,
    },
  });
}
