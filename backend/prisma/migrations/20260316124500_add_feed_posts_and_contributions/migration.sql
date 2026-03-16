ALTER TABLE "StudySheet"
ADD COLUMN IF NOT EXISTS "attachmentName" TEXT,
ADD COLUMN IF NOT EXISTS "allowDownloads" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "linkPath" TEXT;

CREATE TABLE "FeedPost" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "attachmentName" TEXT,
    "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedPostComment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedPostReaction" (
    "userId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "FeedPostReaction_pkey" PRIMARY KEY ("userId","postId")
);

CREATE TABLE "SheetContribution" (
    "id" SERIAL NOT NULL,
    "targetSheetId" INTEGER NOT NULL,
    "forkSheetId" INTEGER NOT NULL,
    "proposerId" INTEGER NOT NULL,
    "reviewerId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SheetContribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SheetContribution_targetSheetId_status_idx" ON "SheetContribution"("targetSheetId", "status");
CREATE INDEX "SheetContribution_proposerId_status_idx" ON "SheetContribution"("proposerId", "status");

ALTER TABLE "FeedPost"
ADD CONSTRAINT "FeedPost_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedPost"
ADD CONSTRAINT "FeedPost_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedPostComment"
ADD CONSTRAINT "FeedPostComment_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedPostComment"
ADD CONSTRAINT "FeedPostComment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedPostReaction"
ADD CONSTRAINT "FeedPostReaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedPostReaction"
ADD CONSTRAINT "FeedPostReaction_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SheetContribution"
ADD CONSTRAINT "SheetContribution_targetSheetId_fkey"
FOREIGN KEY ("targetSheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SheetContribution"
ADD CONSTRAINT "SheetContribution_forkSheetId_fkey"
FOREIGN KEY ("forkSheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SheetContribution"
ADD CONSTRAINT "SheetContribution_proposerId_fkey"
FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SheetContribution"
ADD CONSTRAINT "SheetContribution_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
