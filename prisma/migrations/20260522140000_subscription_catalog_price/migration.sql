-- CreateTable
CREATE TABLE "SubscriptionCatalogPrice" (
    "id" TEXT NOT NULL,
    "monthlyRateXcd" DECIMAL(10,2) NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCatalogPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCatalogPrice_monthlyRateXcd_durationMonths_key" ON "SubscriptionCatalogPrice"("monthlyRateXcd", "durationMonths");

-- CreateIndex
CREATE INDEX "SubscriptionCatalogPrice_durationMonths_idx" ON "SubscriptionCatalogPrice"("durationMonths");

-- Seed catalog tiers × terms (Stripe Price ids set in admin or env)
INSERT INTO "SubscriptionCatalogPrice" ("id", "monthlyRateXcd", "durationMonths", "stripePriceId", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.rate, v.months, NULL, true, NOW(), NOW()
FROM (
  VALUES
    (30::decimal, 1),
    (30::decimal, 3),
    (30::decimal, 6),
    (30::decimal, 12),
    (25::decimal, 1),
    (25::decimal, 3),
    (25::decimal, 6),
    (25::decimal, 12),
    (20::decimal, 1),
    (20::decimal, 3),
    (20::decimal, 6),
    (20::decimal, 12)
) AS v(rate, months)
WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionCatalogPrice" LIMIT 1);
