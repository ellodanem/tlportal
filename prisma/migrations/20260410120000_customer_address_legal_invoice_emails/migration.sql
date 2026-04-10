-- Align Customer with Invoiless-style billing (structured address, legal, Cc/Bcc).

ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "state" TEXT;
ALTER TABLE "Customer" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "country" TEXT;
ALTER TABLE "Customer" ADD COLUMN "legalInfo" TEXT;
ALTER TABLE "Customer" ADD COLUMN "invoiceCc" TEXT;
ALTER TABLE "Customer" ADD COLUMN "invoiceBcc" TEXT;
