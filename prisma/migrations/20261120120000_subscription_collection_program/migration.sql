-- Scheduled card collection for canonical Stripe agreements.

CREATE TYPE "SubscriptionCollectionProgramStatus" AS ENUM ('armed', 'completed', 'canceled');

CREATE TABLE "SubscriptionCollectionProgram" (
    "id" TEXT NOT NULL,
    "customerSubscriptionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "SubscriptionCollectionProgramStatus" NOT NULL,
    "firstChargeDate" DATE NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 3,
    "lastCardLinkSentOn" DATE,
    "lastPayNowSentOn" DATE,
    "lastCheckoutKind" TEXT,
    "lastCheckoutUrl" TEXT,
    "lastCheckoutSessionId" TEXT,
    "lastNotifySummary" TEXT,
    "armedById" TEXT,
    "armedAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCollectionProgram_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionCollectionProgram_customerSubscriptionId_key" ON "SubscriptionCollectionProgram"("customerSubscriptionId");
CREATE INDEX "SubscriptionCollectionProgram_status_firstChargeDate_idx" ON "SubscriptionCollectionProgram"("status", "firstChargeDate");
CREATE INDEX "SubscriptionCollectionProgram_customerId_idx" ON "SubscriptionCollectionProgram"("customerId");

ALTER TABLE "SubscriptionCollectionProgram" ADD CONSTRAINT "SubscriptionCollectionProgram_customerSubscriptionId_fkey" FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
