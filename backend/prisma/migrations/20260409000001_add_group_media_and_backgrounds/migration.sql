-- Phase 4 Track A: group media paywall + owner backgrounds

-- StudyGroup owner-curated background
ALTER TABLE "StudyGroup" ADD COLUMN "backgroundUrl" TEXT;
ALTER TABLE "StudyGroup" ADD COLUMN "backgroundCredit" TEXT;

-- GroupResource structured media metadata (nullable so legacy rows still work)
ALTER TABLE "GroupResource" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "GroupResource" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "GroupResource" ADD COLUMN "mediaBytes" INTEGER;
ALTER TABLE "GroupResource" ADD COLUMN "mediaMime" TEXT;

-- Additional index so "all recent media in a group" queries stay fast
CREATE INDEX "GroupResource_groupId_createdAt_idx"
    ON "GroupResource"("groupId", "createdAt" DESC);

-- GroupDiscussionPost optional attachments array (JSON)
ALTER TABLE "GroupDiscussionPost" ADD COLUMN "attachments" JSONB;

-- GroupMediaUsage — per-user weekly counter
CREATE TABLE "GroupMediaUsage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "weekStart" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMediaUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupMediaUsage_userId_weekStart_key"
    ON "GroupMediaUsage"("userId", "weekStart");

CREATE INDEX "GroupMediaUsage_userId_weekStart_idx"
    ON "GroupMediaUsage"("userId", "weekStart");

ALTER TABLE "GroupMediaUsage"
    ADD CONSTRAINT "GroupMediaUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMediaUsage"
    ADD CONSTRAINT "GroupMediaUsage_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
