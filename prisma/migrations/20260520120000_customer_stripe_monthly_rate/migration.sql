-- Per-customer Stripe subscription monthly rate (XCD). Null = use catalog / STRIPE_PRICE_ID_*.
ALTER TABLE "Customer" ADD COLUMN "stripeMonthlyRateXcd" DECIMAL(10,2);
