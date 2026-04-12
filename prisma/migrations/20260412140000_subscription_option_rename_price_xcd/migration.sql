-- Plan amounts are Eastern Caribbean dollars (XCD), not USD.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SubscriptionOption'
      AND column_name = 'priceUsd'
  ) THEN
    ALTER TABLE "SubscriptionOption" RENAME COLUMN "priceUsd" TO "priceXcd";
  END IF;
END $$;
