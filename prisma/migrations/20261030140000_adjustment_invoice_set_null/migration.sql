-- Staff-created adjustment invoices now start as DRAFTS that can be customized or discarded.
-- Discarding a draft must clear the link (agreed, not invoiced) instead of being blocked.
-- Only the foreign-key delete rule of the new, additive table changes; no rows are touched.
-- Rollback: re-create the constraint with ON DELETE RESTRICT.

ALTER TABLE "SubscriptionItemInitialAdjustment" DROP CONSTRAINT "SubscriptionItemInitialAdjustment_invoiceId_fkey";

ALTER TABLE "SubscriptionItemInitialAdjustment" ADD CONSTRAINT "SubscriptionItemInitialAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
