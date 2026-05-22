-- CreateEnum
CREATE TYPE "BroadcastTemplateCategory" AS ENUM ('outage', 'maintenance', 'general', 'billing');

-- CreateTable
CREATE TABLE "BroadcastTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "category" "BroadcastTemplateCategory" NOT NULL DEFAULT 'general',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "whatsappBody" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastTemplate_slug_key" ON "BroadcastTemplate"("slug");

-- CreateIndex
CREATE INDEX "BroadcastTemplate_category_idx" ON "BroadcastTemplate"("category");

-- CreateIndex
CREATE INDEX "BroadcastTemplate_isActive_sortOrder_idx" ON "BroadcastTemplate"("isActive", "sortOrder");
