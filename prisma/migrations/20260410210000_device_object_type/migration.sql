-- CreateEnum
CREATE TYPE "DeviceObjectType" AS ENUM (
  'car',
  'bike',
  'ambulance',
  'fire_truck',
  'atv',
  'boat',
  'container',
  'bus',
  'garbage_truck',
  'jet_ski',
  'speed_boat'
);

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "objectType" "DeviceObjectType";

-- CreateIndex
CREATE INDEX "Device_objectType_idx" ON "Device"("objectType");
