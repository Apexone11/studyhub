-- Phase 4: Plagiarism detection tables

CREATE TABLE "PlagiarismReport" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "matchedSheetId" INTEGER NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'simhash',
    "highlightedSections" JSONB,
    "aiVerdict" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlagiarismReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlagiarismReport_sheetId_matchedSheetId_key"
    ON "PlagiarismReport"("sheetId", "matchedSheetId");
CREATE INDEX "PlagiarismReport_sheetId_status_idx"
    ON "PlagiarismReport"("sheetId", "status");
CREATE INDEX "PlagiarismReport_matchedSheetId_idx"
    ON "PlagiarismReport"("matchedSheetId");
CREATE INDEX "PlagiarismReport_status_createdAt_idx"
    ON "PlagiarismReport"("status", "createdAt");

ALTER TABLE "PlagiarismReport"
    ADD CONSTRAINT "PlagiarismReport_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlagiarismReport"
    ADD CONSTRAINT "PlagiarismReport_matchedSheetId_fkey"
    FOREIGN KEY ("matchedSheetId") REFERENCES "StudySheet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlagiarismReport"
    ADD CONSTRAINT "PlagiarismReport_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PlagiarismDispute" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlagiarismDispute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlagiarismDispute_reportId_userId_key"
    ON "PlagiarismDispute"("reportId", "userId");
CREATE INDEX "PlagiarismDispute_reportId_status_idx"
    ON "PlagiarismDispute"("reportId", "status");

ALTER TABLE "PlagiarismDispute"
    ADD CONSTRAINT "PlagiarismDispute_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "PlagiarismReport"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlagiarismDispute"
    ADD CONSTRAINT "PlagiarismDispute_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlagiarismDispute"
    ADD CONSTRAINT "PlagiarismDispute_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
