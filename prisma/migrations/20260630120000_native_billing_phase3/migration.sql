-- Native billing (Phase 3): recurring invoice schedules.
-- Additive — replaces Invoiless retainers for cash/cheque/bank payers over time.

-- CreateEnum
CREATE TYPE "RecurringScheduleStatus" AS ENUM ('active', 'paused', 'ended');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "recurringScheduleId" TEXT;

-- CreateTable
CREATE TABLE "RecurringInvoiceSchedule" (
    "id" TEXT NOT NULL,
    "status" "RecurringScheduleStatus" NOT NULL DEFAULT 'active',
    "name" TEXT,
    "customerId" TEXT,
    "billToName" TEXT,
    "billToLines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'XCD',
    "taxLabel" TEXT,
    "taxRatePercent" DECIMAL(5,2),
    "notes" TEXT,
    "paymentInstructions" TEXT,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "nextIssueDate" TIMESTAMP(3) NOT NULL,
    "dueDaysAfterIssue" INTEGER NOT NULL DEFAULT 30,
    "autoEmail" BOOLEAN NOT NULL DEFAULT true,
    "emailTo" TEXT,
    "serviceAssignmentId" TEXT,
    "lastGeneratedAt" TIMESTAMP(3),
    "lastInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoiceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringScheduleLineItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitLabel" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "RecurringScheduleLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringInvoiceSchedule_lastInvoiceId_key" ON "RecurringInvoiceSchedule"("lastInvoiceId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceSchedule_customerId_idx" ON "RecurringInvoiceSchedule"("customerId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceSchedule_status_nextIssueDate_idx" ON "RecurringInvoiceSchedule"("status", "nextIssueDate");

-- CreateIndex
CREATE INDEX "RecurringScheduleLineItem_scheduleId_idx" ON "RecurringScheduleLineItem"("scheduleId");

-- CreateIndex
CREATE INDEX "Invoice_recurringScheduleId_idx" ON "Invoice"("recurringScheduleId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "RecurringInvoiceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceSchedule" ADD CONSTRAINT "RecurringInvoiceSchedule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceSchedule" ADD CONSTRAINT "RecurringInvoiceSchedule_lastInvoiceId_fkey" FOREIGN KEY ("lastInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceSchedule" ADD CONSTRAINT "RecurringInvoiceSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringScheduleLineItem" ADD CONSTRAINT "RecurringScheduleLineItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "RecurringInvoiceSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
