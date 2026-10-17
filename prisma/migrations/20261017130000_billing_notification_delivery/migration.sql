CREATE TYPE "BillingNotificationChannel" AS ENUM ('email', 'whatsapp');
CREATE TYPE "BillingNotificationStatus" AS ENUM ('pending', 'sending', 'sent', 'failed', 'suppressed');

CREATE TABLE "BillingNotificationDelivery" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "eventKind" TEXT NOT NULL,
    "channel" "BillingNotificationChannel" NOT NULL,
    "status" "BillingNotificationStatus" NOT NULL DEFAULT 'pending',
    "destination" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "suppressedAt" TIMESTAMP(3),
    "retriedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingNotificationDelivery_idempotencyKey_key" ON "BillingNotificationDelivery"("idempotencyKey");
CREATE INDEX "BillingNotificationDelivery_customerId_status_createdAt_idx" ON "BillingNotificationDelivery"("customerId", "status", "createdAt" DESC);
CREATE INDEX "BillingNotificationDelivery_invoiceId_eventKind_idx" ON "BillingNotificationDelivery"("invoiceId", "eventKind");

ALTER TABLE "BillingNotificationDelivery" ADD CONSTRAINT "BillingNotificationDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingNotificationDelivery" ADD CONSTRAINT "BillingNotificationDelivery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingNotificationDelivery" ADD CONSTRAINT "BillingNotificationDelivery_retriedById_fkey" FOREIGN KEY ("retriedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
