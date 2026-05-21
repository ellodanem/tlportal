import { createInvoilessCustomer, updateInvoilessCustomer } from "@/lib/invoiless/customer-sync";
import type { BillingPort, EnsureBillingCustomerInput, EnsureBillingCustomerResult } from "@/lib/ports/billing";

export const invoilessBillingAdapter: BillingPort = {
  provider: "invoiless",

  isConfigured(): boolean {
    return Boolean(process.env.INVOILESS_API_KEY?.trim());
  },

  async ensureCustomer(input: EnsureBillingCustomerInput): Promise<EnsureBillingCustomerResult> {
    const { customer } = input;
    if (customer.invoilessCustomerId) {
      await updateInvoilessCustomer(customer);
      return { externalCustomerId: customer.invoilessCustomerId };
    }
    const { id } = await createInvoilessCustomer(customer);
    return { externalCustomerId: id };
  },
};
