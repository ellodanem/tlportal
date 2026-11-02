import { NextResponse } from "next/server";

import { runStripeQuantityAudit } from "@/lib/services/stripe-quantity-audit-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Nightly Stripe vehicle-quantity check; `?dryRun=1` reports without recording or texting staff. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET is not set. Add it in the project environment for cron requests.",
      },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runStripeQuantityAudit({ dryRun });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
