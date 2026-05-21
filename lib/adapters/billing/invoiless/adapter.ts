import { createInvoilessCustomer, updateInvoilessCustomer } from "@/lib/invoiless/customer-sync";
import type { BillingPort, EnsureBillingCustomerInput, EnsureBillingCustomerResult } from "@/lib/ports/billing";
import { getInvoilessExternalCustomerId } from "@/lib/services/billing-service";

export const invoilessBillingAdapter: BillingPort = {
  provider: "invoiless",

  isConfigured(): boolean {
    return Boolean(process.env.INVOILESS_API_KEY?.trim());
  },

  async ensureCustomer(input: EnsureBillingCustomerInput): Promise<EnsureBillingCustomerResult> {
    const { customer, tlCustomerId } = input;
    const existingId = await getInvoilessExternalCustomerId(tlCustomerId);
    if (existingId) {
      await updateInvoilessCustomer({ ...customer, invoilessCustomerId: existingId });
      return { externalCustomerId: existingId };
    }
    const { id } = await createInvoilessCustomer(customer);
    return { externalCustomerId: id };
  },
};
