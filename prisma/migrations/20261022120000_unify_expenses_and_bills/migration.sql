-- Vendor bills are now the single expense ledger. Preserve legacy expense
-- metadata on the bill and represent an already-paid expense as one bill plus
-- one non-voided payment.
ALTER TABLE "VendorBill"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "deviceId" TEXT,
  ADD COLUMN "receiptStoragePath" TEXT;

CREATE INDEX "VendorBill_categoryId_idx" ON "VendorBill"("categoryId");
CREATE INDEX "VendorBill_customerId_idx" ON "VendorBill"("customerId");
CREATE INDEX "VendorBill_deviceId_idx" ON "VendorBill"("deviceId");

ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Older databases can contain an unlinked free-text payee. Materialize those
-- payees as vendors before moving the records into VendorBill.
INSERT INTO "Vendor" ("id", "name", "currency", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       COALESCE(NULLIF(TRIM(e."vendor"), ''), 'Unknown vendor'),
       MIN(e."currency"),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Expense" e
WHERE e."vendorId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Vendor" v
    WHERE LOWER(TRIM(v."name")) = LOWER(COALESCE(NULLIF(TRIM(e."vendor"), ''), 'Unknown vendor'))
  )
GROUP BY COALESCE(NULLIF(TRIM(e."vendor"), ''), 'Unknown vendor');

UPDATE "Expense" e
SET "vendorId" = v."id"
FROM "Vendor" v
WHERE e."vendorId" IS NULL
  AND LOWER(TRIM(v."name")) = LOWER(COALESCE(NULLIF(TRIM(e."vendor"), ''), 'Unknown vendor'));

INSERT INTO "VendorBill" (
  "id", "status", "vendorId", "description", "currency", "total",
  "amountPaid", "amountDue", "billDate", "notes", "categoryId",
  "customerId", "deviceId", "receiptStoragePath", "createdById",
  "createdAt", "updatedAt"
)
SELECT
  e."id", 'paid'::"VendorBillStatus", e."vendorId", e."description",
  e."currency", e."amount", e."amount", 0, e."expenseDate", e."notes",
  e."categoryId", e."customerId", e."deviceId", e."receiptStoragePath",
  e."recordedById", e."createdAt", e."updatedAt"
FROM "Expense" e;

INSERT INTO "VendorBillPayment" (
  "id", "billId", "amount", "currency", "method", "reference", "paidAt",
  "recordedById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, e."id", e."amount", e."currency", e."method",
  e."reference", e."expenseDate", e."recordedById", e."createdAt", e."updatedAt"
FROM "Expense" e;

DROP TABLE "Expense";
