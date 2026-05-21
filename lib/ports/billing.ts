import type { BillingProvider, Customer } from "@prisma/client";

export type EnsureBillingCustomerInput = {
  tlCustomerId: string;
  customer: Customer;
};

export type EnsureBillingCustomerResult = {
  externalCustomerId: string;
};

export type InvoiceSummary = {
  id: string;
  number: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
};

/**
 * Billing provider contract — implementations live under lib/adapters/billing/*.
 */
export interface BillingPort {
  readonly provider: BillingProvider;

  isConfigured(): boolean;

  ensureCustomer(input: EnsureBillingCustomerInput): Promise<EnsureBillingCustomerResult>;
}
