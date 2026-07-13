-- CreateTable
CREATE TABLE "CustomerPortalUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "traqcareUsername" TEXT,
    "traqcarePassword" TEXT,
    "role" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPortalUser_customerId_idx" ON "CustomerPortalUser"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerPortalUser" ADD CONSTRAINT "CustomerPortalUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one portal user from legacy Customer Traqcare username/password when present.
INSERT INTO "CustomerPortalUser" (
    "id",
    "customerId",
    "name",
    "email",
    "phone",
    "traqcareUsername",
    "traqcarePassword",
    "role",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    c."id",
    NULL,
    NULL,
    NULL,
    c."traqcareUsername",
    c."traqcarePassword",
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Customer" c
WHERE
    (c."traqcareUsername" IS NOT NULL AND btrim(c."traqcareUsername") <> '')
    OR (c."traqcarePassword" IS NOT NULL AND btrim(c."traqcarePassword") <> '');
