-- Phase 0C: durable Stripe Checkout operations and retryable webhook fulfillment.
-- Additive operation state; existing webhook rows are treated as completed history.

CREATE TYPE "BillingOperationType" AS ENUM ('stripe_checkout_activation');
CREATE TYPE "BillingOperationStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'retry_required');

ALTER TABLE "StripeWebhookEvent"
ALTER COLUMN "processedAt" DROP NOT NULL,
ALTER COLUMN "processedAt" DROP DEFAULT,
ADD COLUMN "status" "BillingOperationStatus" NOT NULL DEFAULT 'completed',
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "failureMessage" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "BillingOperation" (
  "id" TEXT NOT NULL,
  "type" "BillingOperationType" NOT NULL,
  "status" "BillingOperationStatus" NOT NULL DEFAULT 'pending',
  "customerId" TEXT NOT NULL,
  "customerSubscriptionId" TEXT,
  "operationKey" TEXT NOT NULL,
  "activeKey" TEXT,
  "requestFingerprint" TEXT NOT NULL,
  "providerReference" TEXT,
  "providerSubscriptionReference" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingOperation_operationKey_key" ON "BillingOperation"("operationKey");
CREATE UNIQUE INDEX "BillingOperation_activeKey_key" ON "BillingOperation"("activeKey");
CREATE INDEX "BillingOperation_customerId_type_createdAt_idx" ON "BillingOperation"("customerId", "type", "createdAt" DESC);
CREATE INDEX "BillingOperation_status_nextRetryAt_idx" ON "BillingOperation"("status", "nextRetryAt");
CREATE INDEX "BillingOperation_providerReference_idx" ON "BillingOperation"("providerReference");
CREATE INDEX "StripeWebhookEvent_status_lastAttemptAt_idx" ON "StripeWebhookEvent"("status", "lastAttemptAt");
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

ALTER TABLE "BillingOperation"
ADD CONSTRAINT "BillingOperation_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingOperation"
ADD CONSTRAINT "BillingOperation_customerSubscriptionId_fkey"
FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
