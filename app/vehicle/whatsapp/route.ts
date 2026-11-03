import { NextResponse, type NextRequest } from "next/server";

import {
  buildWhatsAppUrl,
  getVehicleWhatsAppNumber,
  isLikelyBot,
  recordVehicleQrEvent,
  sanitizeSource,
  VEHICLE_QR_WHATSAPP_CLICK_CATEGORY,
} from "@/lib/vehicle/qr-landing";

/**
 * Tracked redirect behind the primary WhatsApp button on /vehicle.
 * Works without JavaScript; logs the click, then sends the visitor to WhatsApp.
 */
export async function GET(req: NextRequest) {
  const number = getVehicleWhatsAppNumber();
  if (!number) {
    return NextResponse.redirect(new URL("/vehicle", req.url), 302);
  }

  const userAgent = req.headers.get("user-agent");
  if (!isLikelyBot(userAgent)) {
    try {
      await recordVehicleQrEvent({
        category: VEHICLE_QR_WHATSAPP_CLICK_CATEGORY,
        source: sanitizeSource(req.nextUrl.searchParams.get("src")),
        userAgent,
      });
    } catch (e) {
      // Never block the visitor from reaching WhatsApp because logging failed.
      console.error("[vehicle-qr] failed to record WhatsApp click", e);
    }
  }

  const res = NextResponse.redirect(buildWhatsAppUrl(number), 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
