-- CreateEnum
CREATE TYPE "ServiceAssignmentPauseReason" AS ENUM ('accident', 'no_vehicle', 'seasonal', 'delinquent', 'other');

-- AlterTable
ALTER TABLE "ServiceAssignment" ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "pauseReason" "ServiceAssignmentPauseReason",
ADD COLUMN "pauseNote" TEXT,
ADD COLUMN "frozenNextDueDate" TIMESTAMP(3),
ADD COLUMN "resumedAt" TIMESTAMP(3);
