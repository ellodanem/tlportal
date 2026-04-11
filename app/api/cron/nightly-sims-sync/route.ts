import { NextResponse } from "next/server";

import { executeOneNceSimsInventoryImport } from "@/lib/admin/one-nce-sims-sync";

/** Nightly job can process many ICCIDs + merge calls; allow long runs on supported hosts. */
export const maxDuration = 300;

export const dynamic = "force-dynamic";

/**
 * Daily 1NCE SIM import (inventory + usage merge). Secured with CRON_SECRET (Bearer).
 * Schedule: see vercel.json — 04:05 UTC ≈ 00:05 AST (Barbados / St Lucia, UTC−4, no DST).
 */
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

  const result = await executeOneNceSimsInventoryImport();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imported: result.imported,
    at: new Date().toISOString(),
  });
}
