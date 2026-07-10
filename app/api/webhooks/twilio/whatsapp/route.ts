import { validateRequest } from "twilio";

import { ingestInboundWhatsAppMessage } from "@/lib/communications/whatsapp-conversation-service";
import { getAppBaseUrl } from "@/lib/stripe/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — Twilio WhatsApp inbound messages.
 * Configure in Twilio Console → Messaging → WhatsApp sandbox / sender →
 * “When a message comes in” → `https://<host>/api/webhooks/twilio/whatsapp`
 *
 * Uses TWILIO_AUTH_TOKEN for request signature validation when present.
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  if (authToken) {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const url =
      process.env.TWILIO_WHATSAPP_WEBHOOK_URL?.trim() ||
      `${getAppBaseUrl()}/api/webhooks/twilio/whatsapp`;
    const valid = validateRequest(authToken, signature, url, params);
    if (!valid) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }
  }

  const from = params.From?.trim() ?? "";
  const body = params.Body ?? null;
  const messageSid = params.MessageSid?.trim() || params.SmsMessageSid?.trim() || "";
  if (!from || !messageSid) {
    return new Response("Missing From or MessageSid", { status: 400 });
  }

  const result = await ingestInboundWhatsAppMessage({
    from,
    body,
    messageSid,
    status: params.SmsStatus ?? params.MessageStatus ?? null,
    raw: params,
  });

  if (!result.ok) {
    console.error("[twilio whatsapp webhook]", result.error);
    return new Response(result.error, { status: 400 });
  }

  // Empty TwiML — no auto-reply.
  return new Response("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
