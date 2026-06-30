import { redirect } from "next/navigation";

import { createNativeInvoiceCheckoutSession } from "@/lib/stripe/native-invoice-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — start Stripe Checkout for a native invoice public pay link. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token?.trim()) {
    return new Response("Not found", { status: 404 });
  }

  const result = await createNativeInvoiceCheckoutSession(token.trim());
  if (!result.ok) {
    return new Response(result.error, { status: 400 });
  }

  redirect(result.url);
}
