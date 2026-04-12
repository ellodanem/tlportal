-- Repair Neon DB after failed migration `20260412104500_subscription_option_duration_price` (Prisma P3009).
-- Run this in Neon: SQL Editor → paste → Run. Safe to re-run (idempotent where PG allows).
--
-- After this succeeds, from your laptop (with DIRECT_URL + DATABASE_URL pointing at this DB):
--   npx prisma migrate resolve --applied 20260412104500_subscription_option_duration_price
-- Then redeploy Vercel.

-- 1) New columns (skip if already added)
ALTER TABLE "SubscriptionOption" ADD COLUMN IF NOT EXISTS "durationMonths" INTEGER;
ALTER TABLE "SubscriptionOption" ADD COLUMN IF NOT EXISTS "priceUsd" DECIMAL(10,2);

-- 2) Backfill from legacy sortOrder when that column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SubscriptionOption'
      AND column_name = 'sortOrder'
  ) THEN
    UPDATE "SubscriptionOption" SET "durationMonths" = 1, "priceUsd" = COALESCE("priceUsd", 30::decimal) WHERE "sortOrder" = 10;
    UPDATE "SubscriptionOption" SET "durationMonths" = 3, "priceUsd" = COALESCE("priceUsd", 90::decimal) WHERE "sortOrder" = 20;
    UPDATE "SubscriptionOption" SET "durationMonths" = 6, "priceUsd" = COALESCE("priceUsd", 180::decimal) WHERE "sortOrder" = 30;
    UPDATE "SubscriptionOption" SET "durationMonths" = 12, "priceUsd" = COALESCE("priceUsd", 330::decimal) WHERE "sortOrder" = 40;
  END IF;
END $$;

-- 3) Remove rows we still cannot place (orphan custom plans)
DELETE FROM "SubscriptionOption" WHERE "durationMonths" IS NULL;

-- 4) Ensure four standard tiers
INSERT INTO "SubscriptionOption" ("id", "durationMonths", "priceUsd", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.m, v.p, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES (1, 30::decimal), (3, 90::decimal), (6, 180::decimal), (12, 330::decimal)) AS v(m, p)
WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionOption" x WHERE x."durationMonths" = v.m);

-- 5) One row per duration
DELETE FROM "SubscriptionOption" AS a
USING "SubscriptionOption" AS b
WHERE a."durationMonths" = b."durationMonths" AND a."id" > b."id";

-- 6) NOT NULL (only if no nulls remain)
ALTER TABLE "SubscriptionOption" ALTER COLUMN "durationMonths" SET NOT NULL;
ALTER TABLE "SubscriptionOption" ALTER COLUMN "priceUsd" SET NOT NULL;

-- 6b) Unique index (IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionOption_durationMonths_key" ON "SubscriptionOption" ("durationMonths");

-- 7) Drop legacy columns when present
ALTER TABLE "SubscriptionOption" DROP COLUMN IF EXISTS "label";
ALTER TABLE "SubscriptionOption" DROP COLUMN IF EXISTS "sortOrder";
