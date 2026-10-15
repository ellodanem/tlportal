-- Phase 1A1: additive canonical subscription fields and optional attribution.
-- Existing subscriptions remain under legacy control; no commercial values are inferred.

CREATE TYPE "SubscriptionCollectionMethod" AS ENUM ('manual_invoice', 'stripe_autocharge');
CREATE TYPE "SubscriptionLifecycleStatus" AS ENUM ('draft', 'pending_activation', 'active', 'paused', 'canceled', 'ended');
CREATE TYPE "SubscriptionCollectionHealth" AS ENUM ('not_started', 'current', 'past_due', 'unpaid', 'action_required');
CREATE TYPE "SubscriptionControlMode" AS ENUM ('legacy', 'shadow', 'canonical');

ALTER TABLE "CustomerSubscription"
ADD COLUMN "name" TEXT,
ADD COLUMN "reference" TEXT,
ADD COLUMN "collectionMethod" "SubscriptionCollectionMethod",
ADD COLUMN "lifecycleStatus" "SubscriptionLifecycleStatus",
ADD COLUMN "collectionHealth" "SubscriptionCollectionHealth",
ADD COLUMN "billingIntervalMonths" INTEGER,
ADD COLUMN "currency" VARCHAR(3),
ADD COLUMN "agreedAmountPerCycle" DECIMAL(12,2),
ADD COLUMN "commercialStartDate" DATE,
ADD COLUMN "billingAnchorDate" DATE,
ADD COLUMN "nextBillingDate" DATE,
ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "controlMode" "SubscriptionControlMode" NOT NULL DEFAULT 'legacy';

ALTER TABLE "CustomerSubscription"
ADD CONSTRAINT "CustomerSubscription_billingIntervalMonths_check"
CHECK ("billingIntervalMonths" IS NULL OR "billingIntervalMonths" IN (1, 3, 6, 12)),
ADD CONSTRAINT "CustomerSubscription_agreedAmountPerCycle_check"
CHECK ("agreedAmountPerCycle" IS NULL OR "agreedAmountPerCycle" >= 0),
ADD CONSTRAINT "CustomerSubscription_gracePeriodDays_check"
CHECK ("gracePeriodDays" >= 0);

ALTER TABLE "Invoice"
ADD COLUMN "customerSubscriptionId" TEXT;

ALTER TABLE "RecurringInvoiceSchedule"
ADD COLUMN "customerSubscriptionId" TEXT;

CREATE INDEX "Invoice_customerSubscriptionId_idx"
ON "Invoice"("customerSubscriptionId");

CREATE INDEX "RecurringInvoiceSchedule_customerSubscriptionId_idx"
ON "RecurringInvoiceSchedule"("customerSubscriptionId");

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_customerSubscriptionId_fkey"
FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecurringInvoiceSchedule"
ADD CONSTRAINT "RecurringInvoiceSchedule_customerSubscriptionId_fkey"
FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
