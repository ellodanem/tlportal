-- New invoices offer Pay with card unless staff uncheck it.
ALTER TABLE "Invoice" ALTER COLUMN "allowOnlinePayment" SET DEFAULT true;
