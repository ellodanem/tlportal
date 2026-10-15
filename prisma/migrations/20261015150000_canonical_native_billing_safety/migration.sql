-- Phase 3A: canonical native billing idempotency and schedule ownership.
-- Ended schedules remain as history; at most one open schedule may own a canonical subscription.

CREATE UNIQUE INDEX "RecurringInvoiceSchedule_one_open_canonical_subscription_idx"
ON "RecurringInvoiceSchedule"("customerSubscriptionId")
WHERE "customerSubscriptionId" IS NOT NULL AND "status" <> 'ended';

-- One canonical service is represented at most once on one issued invoice.
-- PostgreSQL permits multiple NULL item references, preserving legacy/provider snapshots.
CREATE UNIQUE INDEX "InvoiceServiceSnapshot_invoiceId_subscriptionItemId_key"
ON "InvoiceServiceSnapshot"("invoiceId", "subscriptionItemId");
