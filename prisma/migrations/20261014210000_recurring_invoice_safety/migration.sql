-- Phase 0B: durable recurring-invoice period idempotency and delivery state.
-- Additive only. Historical invoices remain unchanged (all new nullable fields stay null).

CREATE TYPE "RecurringInvoiceDeliveryStatus" AS ENUM ('sending', 'sent', 'failed', 'not_requested');

ALTER TABLE "Invoice"
ADD COLUMN "recurringPeriodStart" TIMESTAMP(3),
ADD COLUMN "recurringGenerationKey" TEXT,
ADD COLUMN "recurringDeliveryStatus" "RecurringInvoiceDeliveryStatus",
ADD COLUMN "recurringDeliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "recurringDeliveryClaimedAt" TIMESTAMP(3),
ADD COLUMN "recurringDeliveryError" TEXT;

CREATE UNIQUE INDEX "Invoice_recurringGenerationKey_key"
ON "Invoice"("recurringGenerationKey");
