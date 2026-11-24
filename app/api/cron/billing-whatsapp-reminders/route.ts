import { NextResponse } from "next/server";

import { processInvoiceNotificationReminders } from "@/lib/billing/invoice-notifications";
import { processCanonicalCollectionPrograms } from "@/lib/services/canonical-collection-program-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily invoice notices and Collection Checkout sends (Email + WhatsApp; no customer SMS).
 *  Scheduled payment reminders are gated by `SCHEDULED_PAYMENT_REMINDERS_ENABLED`.
 *  Collection programs are not gated on that flag.
 *  Stripe paid/failed webhooks are not invoked from this cron. */
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

  const [reminders, collection] = await Promise.all([
    processInvoiceNotificationReminders(),
    processCanonicalCollectionPrograms(),
  ]);
  return NextResponse.json({ ...reminders, collection });
}
