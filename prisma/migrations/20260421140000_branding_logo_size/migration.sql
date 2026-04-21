-- CreateEnum
CREATE TYPE "BrandingLogoSize" AS ENUM ('s', 'm', 'l', 'xl');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "logoSize" "BrandingLogoSize" NOT NULL DEFAULT 'm';
