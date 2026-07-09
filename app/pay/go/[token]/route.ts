import { resolvePayLinkTokenDestination } from "@/lib/stripe/payment-failure-recovery";
import { getAppBaseUrl } from "@/lib/stripe/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — universal decline pay-link redirect.
 *
 * The WhatsApp decline template uses a fixed button base (`/pay/go/{token}`) because WhatsApp
 * URL buttons require a static domain. This resolves the token to the real destination
 * (native pay page on our domain, or the Stripe hosted invoice) and 302-redirects.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const destination = await resolvePayLinkTokenDestination(token ?? "");
  const target = destination ?? `${getAppBaseUrl()}/pay/cancel`;
  return Response.redirect(target, 302);
}
