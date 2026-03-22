-- AlterTable
ALTER TABLE "Appeal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmailSuppression" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FeedPost" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ModerationCase" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Note" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SheetContribution" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SheetHtmlVersion" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StudySheet" ADD COLUMN     "htmlRiskTier" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VerificationChallenge" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Backfill: existing pending_review HTML sheets are Tier 2
UPDATE "StudySheet" SET "htmlRiskTier" = 2 WHERE "status" = 'pending_review' AND "contentFormat" = 'html';

-- CreateIndex
CREATE INDEX "StudySheet_htmlRiskTier_status_createdAt_idx" ON "StudySheet"("htmlRiskTier", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "StudySheet" ADD CONSTRAINT "StudySheet_forkOf_fkey" FOREIGN KEY ("forkOf") REFERENCES "StudySheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
