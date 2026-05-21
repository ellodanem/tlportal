-- CreateEnum
CREATE TYPE "CustomerBillingMode" AS ENUM ('manual_legacy', 'stripe_subscription');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('invoiless', 'stripe');

-- CreateEnum
CREATE TYPE "GpsProvider" AS ENUM ('traqcare');

-- CreateEnum
CREATE TYPE "DeviceLinkRole" AS ENUM ('primary', 'secondary', 'migrating');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "billingMode" "CustomerBillingMode" NOT NULL DEFAULT 'manual_legacy';

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "mode" "CustomerBillingMode" NOT NULL DEFAULT 'manual_legacy',
    "status" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDeviceLink" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "provider" "GpsProvider" NOT NULL,
    "externalDeviceId" TEXT,
    "externalAccountRef" TEXT,
    "portalUrl" TEXT,
    "role" "DeviceLinkRole" NOT NULL DEFAULT 'primary',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDeviceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "customerId" TEXT,
    "deviceId" TEXT,
    "actorUserId" TEXT,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingAccount_customerId_idx" ON "BillingAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_customerId_provider_key" ON "BillingAccount"("customerId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_provider_externalCustomerId_key" ON "BillingAccount"("provider", "externalCustomerId");

-- CreateIndex
CREATE INDEX "ProviderDeviceLink_deviceId_idx" ON "ProviderDeviceLink"("deviceId");

-- CreateIndex
CREATE INDEX "ProviderDeviceLink_provider_idx" ON "ProviderDeviceLink"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDeviceLink_deviceId_provider_key" ON "ProviderDeviceLink"("deviceId", "provider");

-- CreateIndex
CREATE INDEX "OperationalEvent_customerId_occurredAt_idx" ON "OperationalEvent"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_deviceId_occurredAt_idx" ON "OperationalEvent"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_category_occurredAt_idx" ON "OperationalEvent"("category", "occurredAt");

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDeviceLink" ADD CONSTRAINT "ProviderDeviceLink_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Invoiless billing accounts from legacy Customer.invoilessCustomerId
INSERT INTO "BillingAccount" ("id", "customerId", "provider", "externalCustomerId", "mode", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    'invoiless'::"BillingProvider",
    "invoilessCustomerId",
    'manual_legacy'::"CustomerBillingMode",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Customer"
WHERE "invoilessCustomerId" IS NOT NULL
  AND TRIM("invoilessCustomerId") <> '';
