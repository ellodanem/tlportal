CREATE TYPE "VendorBillStatus" AS ENUM ('draft', 'open', 'partially_paid', 'paid', 'overdue', 'void');

CREATE TABLE "VendorBill" (
    "id" TEXT NOT NULL,
    "status" "VendorBillStatus" NOT NULL DEFAULT 'draft',
    "vendorId" TEXT NOT NULL,
    "vendorInvoiceNumber" TEXT,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'XCD',
    "total" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorBillPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XCD',
    "method" "ExpensePaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorBillPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorBill_vendorId_idx" ON "VendorBill"("vendorId");
CREATE INDEX "VendorBill_status_idx" ON "VendorBill"("status");
CREATE INDEX "VendorBill_dueDate_idx" ON "VendorBill"("dueDate");
CREATE INDEX "VendorBill_updatedAt_idx" ON "VendorBill"("updatedAt");
CREATE INDEX "VendorBillPayment_billId_paidAt_idx" ON "VendorBillPayment"("billId", "paidAt");
CREATE INDEX "VendorBillPayment_recordedById_idx" ON "VendorBillPayment"("recordedById");

ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorBillPayment" ADD CONSTRAINT "VendorBillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "VendorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBillPayment" ADD CONSTRAINT "VendorBillPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
