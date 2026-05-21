-- CreateEnum
CREATE TYPE "CustomerSubscriptionStatus" AS ENUM ('pending_payment', 'active', 'past_due', 'unpaid', 'canceled', 'trialing', 'paused');

-- CreateTable
CREATE TABLE "CustomerSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CustomerSubscriptionStatus" NOT NULL DEFAULT 'pending_payment',
    "planTermMonths" INTEGER NOT NULL,
    "monthlyRateXcd" DECIMAL(10,2),
    "vehicleCount" INTEGER,
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSubscription_stripeSubscriptionId_key" ON "CustomerSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CustomerSubscription_customerId_updatedAt_idx" ON "CustomerSubscription"("customerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerSubscription_status_idx" ON "CustomerSubscription"("status");

-- AddForeignKey
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
