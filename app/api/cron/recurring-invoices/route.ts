import { NextResponse } from "next/server";

import { processDueRecurringSchedules } from "@/lib/services/native-recurring-schedule-service";
import { processDueScheduledInvoiceEmails } from "@/lib/services/scheduled-invoice-email-service";
import { backfillStripeNativeInvoiceMirrors } from "@/lib/services/stripe-native-invoice-mirror-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily recurring invoice generation + native invoice overdue marking. Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const [recurring, stripeMirror, scheduledEmails] = await Promise.all([
    processDueRecurringSchedules(),
    backfillStripeNativeInvoiceMirrors(),
    processDueScheduledInvoiceEmails(),
  ]);
  return NextResponse.json({ ...recurring, stripeMirror, scheduledEmails });
}
