-- Rename Stripe invoice.number mirror; add TL display number and paid PDF storage.

ALTER TABLE "BillingInvoice" RENAME COLUMN "invoiceNumber" TO "providerInvoiceNumber";

ALTER TABLE "BillingInvoice" ADD COLUMN "displayNumber" TEXT;
ALTER TABLE "BillingInvoice" ADD COLUMN "pdfStoragePath" TEXT;
ALTER TABLE "BillingInvoice" ADD COLUMN "pdfGeneratedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "BillingInvoice_displayNumber_key" ON "BillingInvoice"("displayNumber");

CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- Seed singleton; first allocated number uses this value (override via INVOICE_SEQUENCE_START in app).
INSERT INTO "InvoiceSequence" ("id", "nextValue", "updatedAt")
VALUES ('default', 100900, CURRENT_TIMESTAMP);
