import { NextResponse } from "next/server";

import { processDueRecurringSchedules } from "@/lib/services/native-recurring-schedule-service";
import { processDueScheduledInvoiceEmails } from "@/lib/services/scheduled-invoice-email-service";
import { fulfillPendingPaidStripeReceipts } from "@/lib/services/billing-paid-receipt-fulfillment-service";
import { backfillRecentPaidStripeInvoices } from "@/lib/services/stripe-invoice-backfill-service";
import { backfillStripeNativeInvoiceMirrors } from "@/lib/services/stripe-native-invoice-mirror-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily recurring invoice generation + Stripe invoice / receipt catch-up. Bearer CRON_SECRET. */
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

  const [recurring, scheduledEmails, stripeCatchUp] = await Promise.all([
    processDueRecurringSchedules(),
    processDueScheduledInvoiceEmails(),
    (async () => {
      const stripeInvoices = await backfillRecentPaidStripeInvoices();
      const stripeMirror = await backfillStripeNativeInvoiceMirrors();
      const paidReceipts = await fulfillPendingPaidStripeReceipts(25);
      return { stripeInvoices, stripeMirror, paidReceipts };
    })(),
  ]);
  return NextResponse.json({
    ...recurring,
    scheduledEmails,
    ...stripeCatchUp,
  });
}
