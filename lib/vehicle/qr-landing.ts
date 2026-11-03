import "server-only";

import { prisma } from "@/lib/db";

/** `OperationalEvent.category` values for the /vehicle QR landing page. */
export const VEHICLE_QR_VISIT_CATEGORY = "vehicle_qr.visit";
export const VEHICLE_QR_WHATSAPP_CLICK_CATEGORY = "vehicle_qr.whatsapp_click";

const DEFAULT_WHATSAPP_MESSAGE =
  "Hi Track Lucia, I'd like a GPS tracking quote for my vehicle.";

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_UA.test(userAgent);
}

/** Optional `?src=` tag so different printed QR codes can be told apart. Keeps it short and safe. */
export function sanitizeSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_.\-]/g, "").slice(0, 48);
  return cleaned || null;
}

/** Business WhatsApp number (digits only, country code included), or null when unset. */
export function getVehicleWhatsAppNumber(): string | null {
  const raw =
    process.env.VEHICLE_WHATSAPP_NUMBER?.trim() ||
    process.env.TWILIO_WHATSAPP_FROM?.trim() ||
    "";
  const digits = raw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function buildWhatsAppUrl(number: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(DEFAULT_WHATSAPP_MESSAGE)}`;
}

function deviceKind(userAgent: string): "ios" | "android" | "desktop" | "other" {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/android/i.test(userAgent)) return "android";
  if (/windows|macintosh|linux|cros/i.test(userAgent)) return "desktop";
  return "other";
}

export async function recordVehicleQrEvent(input: {
  category: typeof VEHICLE_QR_VISIT_CATEGORY | typeof VEHICLE_QR_WHATSAPP_CLICK_CATEGORY;
  source: string | null;
  userAgent: string | null;
  referrer?: string | null;
}): Promise<void> {
  const isClick = input.category === VEHICLE_QR_WHATSAPP_CLICK_CATEGORY;
  await prisma.operationalEvent.create({
    data: {
      category: input.category,
      summary: isClick
        ? "Vehicle QR page: WhatsApp button clicked"
        : "Vehicle QR page: visit",
      payload: {
        source: input.source,
        device: deviceKind(input.userAgent ?? ""),
        referrer: input.referrer?.slice(0, 200) || null,
      },
    },
  });
}
