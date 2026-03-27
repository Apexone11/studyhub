-- Add moderationStatus to FeedPost, FeedPostComment, and Comment (sheet comments)
ALTER TABLE "FeedPost" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'clean';
ALTER TABLE "FeedPostComment" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'clean';
ALTER TABLE "Comment" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'clean';

-- ModerationSnapshot: stores content before takedown for restore on appeal
CREATE TABLE "ModerationSnapshot" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "contentJson" JSONB NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "ModerationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationSnapshot_caseId_idx" ON "ModerationSnapshot"("caseId");
CREATE INDEX "ModerationSnapshot_targetType_targetId_idx" ON "ModerationSnapshot"("targetType", "targetId");

ALTER TABLE "ModerationSnapshot" ADD CONSTRAINT "ModerationSnapshot_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
