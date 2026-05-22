import { NextResponse } from "next/server";

import { processInFlightBroadcastCampaigns } from "@/lib/broadcast/process-campaign";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Processes pending broadcast email deliveries (Bearer CRON_SECRET). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set. Add it in the project environment for cron requests." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { campaigns } = await processInFlightBroadcastCampaigns(25);
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    campaigns,
  });
}
