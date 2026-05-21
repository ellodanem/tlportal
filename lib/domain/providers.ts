import type { BillingProvider, GpsProvider } from "@prisma/client";

export type { BillingProvider, GpsProvider };

export const GPS_PROVIDER_LABEL: Record<GpsProvider, string> = {
  traqcare: "Traqcare",
};

export const BILLING_PROVIDER_LABEL: Record<BillingProvider, string> = {
  invoiless: "Invoiless",
  stripe: "Stripe",
};
