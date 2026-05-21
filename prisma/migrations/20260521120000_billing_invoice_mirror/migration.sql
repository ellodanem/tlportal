-- CreateEnum
CREATE TYPE "BillingInvoiceKind" AS ENUM ('subscription', 'one_time');

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "externalInvoiceId" TEXT NOT NULL,
    "kind" "BillingInvoiceKind" NOT NULL DEFAULT 'subscription',
    "status" TEXT NOT NULL,
    "amountXcd" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'xcd',
    "invoiceNumber" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "invoicePdfUrl" TEXT,
    "stripeSubscriptionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingInvoice_customerId_createdAt_idx" ON "BillingInvoice"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BillingInvoice_status_idx" ON "BillingInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_provider_externalInvoiceId_key" ON "BillingInvoice"("provider", "externalInvoiceId");

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
