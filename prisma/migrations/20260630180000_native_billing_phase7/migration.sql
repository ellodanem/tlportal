-- Native billing (Phase 7): Invoiless cutover — import tracking on Invoice.

ALTER TYPE "InvoiceKind" ADD VALUE 'invoiless_import';

ALTER TABLE "Invoice" ADD COLUMN "invoilessInvoiceId" TEXT,
ADD COLUMN "legacyInvoiceNumber" TEXT,
ADD COLUMN "importedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Invoice_invoilessInvoiceId_key" ON "Invoice"("invoilessInvoiceId");
