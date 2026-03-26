-- Add missing contentPurged column to ModerationCase
ALTER TABLE "ModerationCase" ADD COLUMN "contentPurged" BOOLEAN NOT NULL DEFAULT false;

-- Create ModerationLog table (was in schema.prisma but never migrated)
CREATE TABLE "ModerationLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "caseId" INTEGER,
    "strikeId" INTEGER,
    "appealId" INTEGER,
    "contentType" TEXT,
    "contentId" INTEGER,
    "reason" TEXT,
    "performedBy" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationLog_userId_createdAt_idx" ON "ModerationLog"("userId", "createdAt" DESC);
CREATE INDEX "ModerationLog_caseId_idx" ON "ModerationLog"("caseId");

ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
