-- CreateEnum
CREATE TYPE "ScheduledInvoiceEmailStatus" AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "ScheduledInvoiceEmail" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "ScheduledInvoiceEmailStatus" NOT NULL DEFAULT 'pending',
    "sendAt" TIMESTAMP(3) NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "scheduledById" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledInvoiceEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledInvoiceEmail_status_sendAt_idx" ON "ScheduledInvoiceEmail"("status", "sendAt");

-- CreateIndex
CREATE INDEX "ScheduledInvoiceEmail_invoiceId_idx" ON "ScheduledInvoiceEmail"("invoiceId");

-- AddForeignKey
ALTER TABLE "ScheduledInvoiceEmail" ADD CONSTRAINT "ScheduledInvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledInvoiceEmail" ADD CONSTRAINT "ScheduledInvoiceEmail_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
