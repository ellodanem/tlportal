-- Service start date is optional when registering a device with a customer.

ALTER TABLE "ServiceAssignment" ALTER COLUMN "startDate" DROP NOT NULL;
