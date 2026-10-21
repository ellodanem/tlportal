ALTER TABLE "SimCard"
  ADD COLUMN "providerName" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT '1nce',
  ADD COLUMN "notes" TEXT;

UPDATE "SimCard"
SET "providerName" = '1NCE'
WHERE "providerName" IS NULL;
