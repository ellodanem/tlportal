-- CreateEnum
CREATE TYPE "DeviceUsagePurpose" AS ENUM ('customer', 'internal_demo', 'field_test', 'personal');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "usagePurpose" "DeviceUsagePurpose" NOT NULL DEFAULT 'customer';
ALTER TABLE "Device" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Device_usagePurpose_idx" ON "Device"("usagePurpose");
