-- Extend ModerationCase for user reporting and admin claim workflow
ALTER TABLE "ModerationCase" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "ModerationCase" ADD COLUMN "reporterUserId" INTEGER;
ALTER TABLE "ModerationCase" ADD COLUMN "reasonCategory" TEXT;
ALTER TABLE "ModerationCase" ADD COLUMN "excerpt" TEXT;
ALTER TABLE "ModerationCase" ADD COLUMN "claimedByAdminId" INTEGER;
ALTER TABLE "ModerationCase" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- Foreign keys
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_claimedByAdminId_fkey" FOREIGN KEY ("claimedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "ModerationCase_source_status_idx" ON "ModerationCase"("source", "status");
CREATE INDEX "ModerationCase_claimedByAdminId_idx" ON "ModerationCase"("claimedByAdminId");
