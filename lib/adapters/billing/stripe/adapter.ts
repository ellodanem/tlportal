import { ensureStripeCustomerForTlCustomer } from "@/lib/stripe/customer";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import type { BillingPort, EnsureBillingCustomerInput, EnsureBillingCustomerResult } from "@/lib/ports/billing";

export const stripeBillingAdapter: BillingPort = {
  provider: "stripe",

  isConfigured(): boolean {
    return isStripeBillingEnabled();
  },

  async ensureCustomer(input: EnsureBillingCustomerInput): Promise<EnsureBillingCustomerResult> {
    const { stripeCustomerId } = await ensureStripeCustomerForTlCustomer(input.customer);
    return { externalCustomerId: stripeCustomerId };
  },
};
