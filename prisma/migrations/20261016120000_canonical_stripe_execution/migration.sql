-- Phase 3B2 is additive: existing legacy Checkout operations and invoice rows remain valid.
ALTER TYPE "BillingOperationType" ADD VALUE 'canonical_stripe_activation';
ALTER TYPE "BillingOperationType" ADD VALUE 'canonical_stripe_synchronization';

ALTER TABLE "BillingInvoice"
ADD COLUMN "providerEventCreatedAt" TIMESTAMP(3);

CREATE INDEX "BillingInvoice_providerEventCreatedAt_idx"
ON "BillingInvoice"("providerEventCreatedAt");
