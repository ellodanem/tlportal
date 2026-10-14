CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'XCD',
    "paymentTerms" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");
CREATE INDEX "Vendor_isActive_name_idx" ON "Vendor"("isActive", "name");
ALTER TABLE "Expense" ADD COLUMN "vendorId" TEXT;
CREATE INDEX "Expense_vendorId_idx" ON "Expense"("vendorId");

INSERT INTO "Vendor" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, TRIM("vendor"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Expense"
WHERE TRIM("vendor") <> ''
GROUP BY TRIM("vendor");

UPDATE "Expense" AS e
SET "vendorId" = v."id"
FROM "Vendor" AS v
WHERE TRIM(e."vendor") = v."name";

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
