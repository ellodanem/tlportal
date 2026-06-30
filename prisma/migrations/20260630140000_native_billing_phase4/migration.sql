-- Native billing (Phase 4): link Stripe BillingInvoice mirror to unified AR Invoice row.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "billingInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_billingInvoiceId_key" ON "Invoice"("billingInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingInvoiceId_fkey" FOREIGN KEY ("billingInvoiceId") REFERENCES "BillingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
