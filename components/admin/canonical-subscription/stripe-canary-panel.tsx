import { StripeCanaryControls } from "@/components/admin/canonical-subscription/stripe-canary-controls";
import { cardClass } from "@/components/admin/canonical-subscription/format";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { getCanonicalStripeLiveCanaryPanelState } from "@/lib/services/canonical-stripe-live-canary-service";

/**
 * Owner-only live test: TL Portal itself creates this customer's Stripe subscription. Renders
 * nothing for anyone but the configured canary owner, and nothing for any other subscription.
 */
export async function StripeCanaryPanel({ subscriptionId }: { subscriptionId: string }) {
  const allowed = process.env.CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID?.trim();
  if (!allowed || allowed !== subscriptionId) return null;
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { email: true } });
  const state = await getCanonicalStripeLiveCanaryPanelState({ subscriptionId, actorEmail: user?.email ?? null });
  if (!state.visible) return null;
  return (
    <section aria-labelledby="stripe-canary-heading" className={`${cardClass} border-violet-200 p-5 dark:border-violet-900`}>
      <h2 id="stripe-canary-heading" className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Live test: create the Stripe subscription from TL Portal</h2>
      <p className="mt-1 text-xs text-zinc-500">Only you can see this. It creates one real Stripe Checkout for this customer.</p>
      <div className="mt-3"><StripeCanaryControls subscriptionId={subscriptionId} state={state} /></div>
    </section>
  );
}
