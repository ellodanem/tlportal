-- Add new columns (nullable until backfilled)
ALTER TABLE "SubscriptionOption" ADD COLUMN "durationMonths" INTEGER;
ALTER TABLE "SubscriptionOption" ADD COLUMN "priceUsd" DECIMAL(10,2);

-- Default seed sort orders from repo
UPDATE "SubscriptionOption" SET "durationMonths" = 1, "priceUsd" = 30 WHERE "sortOrder" = 10;
UPDATE "SubscriptionOption" SET "durationMonths" = 3, "priceUsd" = 90 WHERE "sortOrder" = 20;
UPDATE "SubscriptionOption" SET "durationMonths" = 6, "priceUsd" = 180 WHERE "sortOrder" = 30;
UPDATE "SubscriptionOption" SET "durationMonths" = 12, "priceUsd" = 330 WHERE "sortOrder" = 40;

-- Custom rows we cannot infer: removed (FK on registrations becomes NULL)
DELETE FROM "SubscriptionOption" WHERE "durationMonths" IS NULL;

-- Ensure all four standard tiers exist
INSERT INTO "SubscriptionOption" ("id", "durationMonths", "priceUsd", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.m, v.p, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES (1, 30::decimal), (3, 90::decimal), (6, 180::decimal), (12, 330::decimal)) AS v(m, p)
WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionOption" x WHERE x."durationMonths" = v.m);

-- At most one row per duration
DELETE FROM "SubscriptionOption" AS a
USING "SubscriptionOption" AS b
WHERE a."durationMonths" = b."durationMonths" AND a."id" > b."id";

ALTER TABLE "SubscriptionOption" ALTER COLUMN "durationMonths" SET NOT NULL;
ALTER TABLE "SubscriptionOption" ALTER COLUMN "priceUsd" SET NOT NULL;

CREATE UNIQUE INDEX "SubscriptionOption_durationMonths_key" ON "SubscriptionOption"("durationMonths");

ALTER TABLE "SubscriptionOption" DROP COLUMN "label";
ALTER TABLE "SubscriptionOption" DROP COLUMN "sortOrder";
