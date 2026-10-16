-- Phase 3P: distinct, idempotent native invoices for annual mid-cycle additions.

ALTER TYPE "InvoiceKind" ADD VALUE 'annual_adjustment';

ALTER TABLE "Invoice"
ADD COLUMN "adjustmentGenerationKey" TEXT;

CREATE UNIQUE INDEX "Invoice_adjustmentGenerationKey_key"
ON "Invoice"("adjustmentGenerationKey");
