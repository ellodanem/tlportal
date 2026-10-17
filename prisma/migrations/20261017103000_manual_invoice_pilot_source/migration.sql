-- Permit the tightly controlled manual pilot to use an existing one-off invoice as
-- its source of truth when there is no legacy RecurringInvoiceSchedule to retire.
-- Existing schedule-sourced activation rows remain valid and unchanged.
ALTER TABLE "CanonicalManualPilotActivation"
  ADD COLUMN "sourceKind" VARCHAR(32) NOT NULL DEFAULT 'manual_schedule',
  ADD COLUMN "sourceInvoiceId" TEXT;

ALTER TABLE "CanonicalManualPilotActivation"
  ALTER COLUMN "legacyScheduleId" DROP NOT NULL;

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_sourceInvoiceId_key"
  ON "CanonicalManualPilotActivation"("sourceInvoiceId");

ALTER TABLE "CanonicalManualPilotActivation"
  ADD CONSTRAINT "CanonicalManualPilotActivation_sourceInvoiceId_fkey"
  FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CanonicalManualPilotActivation"
  ADD CONSTRAINT "CanonicalManualPilotActivation_source_exactly_one"
  CHECK (
    ("sourceKind" = 'manual_schedule' AND "legacyScheduleId" IS NOT NULL AND "sourceInvoiceId" IS NULL)
    OR
    ("sourceKind" = 'manual_invoice' AND "legacyScheduleId" IS NULL AND "sourceInvoiceId" IS NOT NULL)
  );
