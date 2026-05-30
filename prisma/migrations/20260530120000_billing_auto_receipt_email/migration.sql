-- Auto-email TL paid receipt PDFs on Stripe invoice.paid; track send time for idempotency.
ALTER TABLE "AppSettings" ADD COLUMN "autoEmailPaidStripeReceipts" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "BillingInvoice" ADD COLUMN "receiptEmailedAt" TIMESTAMP(3);
