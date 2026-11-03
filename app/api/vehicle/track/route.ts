import { NextResponse, type NextRequest } from "next/server";

import {
  isLikelyBot,
  recordVehicleQrEvent,
  sanitizeSource,
  VEHICLE_QR_VISIT_CATEGORY,
} from "@/lib/vehicle/qr-landing";

/** Public beacon endpoint: records one visit to the /vehicle QR landing page. */
export async function POST(req: NextRequest) {
  const userAgent = req.headers.get("user-agent");
  if (isLikelyBot(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: { src?: unknown; ref?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Beacon with no/invalid body is still a visit.
  }

  try {
    await recordVehicleQrEvent({
      category: VEHICLE_QR_VISIT_CATEGORY,
      source: sanitizeSource(typeof body.src === "string" ? body.src : null),
      userAgent,
      referrer: typeof body.ref === "string" ? body.ref : null,
    });
  } catch (e) {
    console.error("[vehicle-qr] failed to record visit", e);
  }

  return new NextResponse(null, { status: 204 });
}
