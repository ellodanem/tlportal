-- Optional Traqcare (GPS tracking platform) credentials per customer.

ALTER TABLE "Customer" ADD COLUMN "traqcareUsername" TEXT;
ALTER TABLE "Customer" ADD COLUMN "traqcarePassword" TEXT;
ALTER TABLE "Customer" ADD COLUMN "traqcarePortalUrl" TEXT;
