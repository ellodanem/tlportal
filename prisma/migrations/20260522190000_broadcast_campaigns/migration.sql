-- CreateEnum
CREATE TYPE "BroadcastCampaignStatus" AS ENUM ('queued', 'sending', 'completed', 'completed_with_errors', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BroadcastDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "BroadcastCampaign" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "subjectSnapshot" TEXT NOT NULL,
    "bodyTextSnapshot" TEXT NOT NULL,
    "includeInactive" BOOLEAN NOT NULL DEFAULT false,
    "incidentTitle" TEXT,
    "incidentStatus" TEXT,
    "incidentEta" TEXT,
    "status" "BroadcastCampaignStatus" NOT NULL DEFAULT 'queued',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BroadcastCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "BroadcastDeliveryStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastCampaign_status_createdAt_idx" ON "BroadcastCampaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastCampaign_createdAt_idx" ON "BroadcastCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "BroadcastDelivery_campaignId_status_idx" ON "BroadcastDelivery"("campaignId", "status");

-- CreateIndex
CREATE INDEX "BroadcastDelivery_customerId_idx" ON "BroadcastDelivery"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastDelivery_campaignId_customerId_key" ON "BroadcastDelivery"("campaignId", "customerId");

-- AddForeignKey
ALTER TABLE "BroadcastCampaign" ADD CONSTRAINT "BroadcastCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BroadcastTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastDelivery" ADD CONSTRAINT "BroadcastDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastDelivery" ADD CONSTRAINT "BroadcastDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
