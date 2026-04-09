-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('in_stock', 'assigned', 'suspended', 'returned', 'decommissioned', 'lost');

-- CreateEnum
CREATE TYPE "DeviceCondition" AS ENUM ('new', 'refurbished', 'faulty');

-- CreateEnum
CREATE TYPE "ServiceAssignmentStatus" AS ENUM ('active', 'due_soon', 'overdue', 'suspended', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "invoilessCustomerId" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "category" TEXT,
    "description" TEXT,
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2),
    "invoilessProductId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "serialNumber" TEXT,
    "label" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'in_stock',
    "condition" "DeviceCondition" NOT NULL DEFAULT 'new',
    "purchasedAt" TIMESTAMP(3),
    "warrantyExpiresAt" TIMESTAMP(3),
    "firmwareVersion" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceModelId" TEXT NOT NULL,
    "simCardId" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimCard" (
    "id" TEXT NOT NULL,
    "iccid" TEXT NOT NULL,
    "msisdn" TEXT,
    "imsi" TEXT,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "totalDataMB" DOUBLE PRECISION,
    "usedDataMB" DOUBLE PRECISION,
    "dataExpiryDate" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAssignment" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "ServiceAssignmentStatus" NOT NULL DEFAULT 'active',
    "invoilessRecurringId" TEXT,
    "intervalMonths" INTEGER,
    "lastInvoiceId" TEXT,
    "lastPaymentStatus" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "simCardId" TEXT,

    CONSTRAINT "ServiceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_invoilessCustomerId_key" ON "Customer"("invoilessCustomerId");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_invoilessProductId_key" ON "DeviceModel"("invoilessProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_imei_key" ON "Device"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "Device_simCardId_key" ON "Device"("simCardId");

-- CreateIndex
CREATE INDEX "Device_deviceModelId_idx" ON "Device"("deviceModelId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SimCard_iccid_key" ON "SimCard"("iccid");

-- CreateIndex
CREATE INDEX "SimCard_iccid_idx" ON "SimCard"("iccid");

-- CreateIndex
CREATE INDEX "SimCard_status_idx" ON "SimCard"("status");

-- CreateIndex
CREATE INDEX "ServiceAssignment_customerId_idx" ON "ServiceAssignment"("customerId");

-- CreateIndex
CREATE INDEX "ServiceAssignment_deviceId_idx" ON "ServiceAssignment"("deviceId");

-- CreateIndex
CREATE INDEX "ServiceAssignment_status_idx" ON "ServiceAssignment"("status");

-- CreateIndex
CREATE INDEX "ServiceAssignment_nextDueDate_idx" ON "ServiceAssignment"("nextDueDate");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_simCardId_fkey" FOREIGN KEY ("simCardId") REFERENCES "SimCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_simCardId_fkey" FOREIGN KEY ("simCardId") REFERENCES "SimCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
