-- Per-customer choice: who pays Stripe processing on new Checkout links.
-- true (default) = customer pays listed + processing; false = Track Lucia absorbs.
ALTER TABLE "Customer" ADD COLUMN "stripeFeePassthrough" BOOLEAN NOT NULL DEFAULT true;
