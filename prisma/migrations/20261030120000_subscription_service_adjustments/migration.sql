-- Unified subscription workflow: additive, backward-compatible.
-- * SubscriptionItemInitialAdjustment: auditable agreed partial-period charge per added service
--   (method, exact amount, daily-engine comparison, authoriser, optional invoice link).
-- * creationKey on CustomerSubscription / SubscriptionItem: idempotent create/add submissions.
-- No existing rows are read, rewritten or deleted.
-- Rollback (only if nothing has been written): DROP TABLE "SubscriptionItemInitialAdjustment";
--   DROP INDEX on the two creationKey columns, DROP COLUMN them, DROP TYPE "SubscriptionAdjustmentMethod".

-- CreateEnum
CREATE TYPE "SubscriptionAdjustmentMethod" AS ENUM ('daily_proration', 'monthly_rounded', 'manual_amount');

-- AlterTable
ALTER TABLE "CustomerSubscription" ADD COLUMN     "creationKey" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionItem" ADD COLUMN     "creationKey" TEXT;

-- CreateTable
CREATE TABLE "SubscriptionItemInitialAdjustment" (
    "id" TEXT NOT NULL,
    "subscriptionItemId" TEXT NOT NULL,
    "method" "SubscriptionAdjustmentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "cycleAmount" DECIMAL(12,2) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dailyAmount" DECIMAL(12,2) NOT NULL,
    "roundedMonths" INTEGER,
    "reason" TEXT,
    "authorizedById" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionItemInitialAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionItemInitialAdjustment_subscriptionItemId_key" ON "SubscriptionItemInitialAdjustment"("subscriptionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionItemInitialAdjustment_invoiceId_key" ON "SubscriptionItemInitialAdjustment"("invoiceId");

-- CreateIndex
CREATE INDEX "SubscriptionItemInitialAdjustment_authorizedById_idx" ON "SubscriptionItemInitialAdjustment"("authorizedById");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSubscription_creationKey_key" ON "CustomerSubscription"("creationKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionItem_creationKey_key" ON "SubscriptionItem"("creationKey");

-- AddForeignKey
ALTER TABLE "SubscriptionItemInitialAdjustment" ADD CONSTRAINT "SubscriptionItemInitialAdjustment_subscriptionItemId_fkey" FOREIGN KEY ("subscriptionItemId") REFERENCES "SubscriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionItemInitialAdjustment" ADD CONSTRAINT "SubscriptionItemInitialAdjustment_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionItemInitialAdjustment" ADD CONSTRAINT "SubscriptionItemInitialAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity checks for the new table only.
ALTER TABLE "SubscriptionItemInitialAdjustment" ADD CONSTRAINT "SubscriptionItemInitialAdjustment_amount_check" CHECK ("amount" >= 0 AND "cycleAmount" >= 0 AND "dailyAmount" >= 0);
ALTER TABLE "SubscriptionItemInitialAdjustment" ADD CONSTRAINT "SubscriptionItemInitialAdjustment_period_check" CHECK ("periodEnd" > "periodStart");
