-- Document-level flat discount on native invoices (applied before tax).
ALTER TABLE "Invoice" ADD COLUMN "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
