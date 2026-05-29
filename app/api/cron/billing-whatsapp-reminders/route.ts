import { NextResponse } from "next/server";

import { processBillingWhatsAppReminders } from "@/lib/billing/whatsapp-reminders";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily billing WhatsApp reminders (5/3/0 before due, +3/+5 overdue). Bearer CRON_SECRET. */
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

  const result = await processBillingWhatsAppReminders();
  return NextResponse.json(result);
}
