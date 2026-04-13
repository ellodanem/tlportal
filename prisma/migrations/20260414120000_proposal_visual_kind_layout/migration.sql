-- CreateEnum
CREATE TYPE "ProposalVisualKind" AS ENUM ('media', 'timeline');

-- CreateEnum
CREATE TYPE "ProposalVisualLayout" AS ENUM ('full_width', 'half_width');

-- AlterTable
ALTER TABLE "ProposalVisualBlock" ADD COLUMN     "imageAlt" TEXT,
ADD COLUMN     "kind" "ProposalVisualKind" NOT NULL DEFAULT 'media',
ADD COLUMN     "layout" "ProposalVisualLayout" NOT NULL DEFAULT 'full_width',
ADD COLUMN     "timelineSteps" JSONB;
