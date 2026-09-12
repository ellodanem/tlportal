-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('inbox', 'reviewed', 'featured', 'archived');

-- CreateTable
CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'inbox',
    "body" TEXT NOT NULL,
    "rating" INTEGER,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sharePermission" BOOLEAN NOT NULL DEFAULT false,
    "matchesCustomerId" TEXT,
    "adminNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackSubmission_status_idx" ON "FeedbackSubmission"("status");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_submittedAt_idx" ON "FeedbackSubmission"("submittedAt");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_sharePermission_idx" ON "FeedbackSubmission"("sharePermission");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_email_idx" ON "FeedbackSubmission"("email");

-- AddForeignKey
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_matchesCustomerId_fkey" FOREIGN KEY ("matchesCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
