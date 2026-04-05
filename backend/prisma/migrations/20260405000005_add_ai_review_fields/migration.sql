-- Add AI review fields to StudySheet
ALTER TABLE "StudySheet" ADD COLUMN "aiReviewDecision" TEXT;
ALTER TABLE "StudySheet" ADD COLUMN "aiReviewConfidence" INTEGER;
ALTER TABLE "StudySheet" ADD COLUMN "aiReviewScore" INTEGER;
ALTER TABLE "StudySheet" ADD COLUMN "aiReviewFindings" TEXT;
ALTER TABLE "StudySheet" ADD COLUMN "aiReviewReasoning" TEXT;
ALTER TABLE "StudySheet" ADD COLUMN "aiReviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "StudySheet_aiReviewDecision_idx" ON "StudySheet"("aiReviewDecision");

-- Create AI review audit log table
CREATE TABLE "AiReviewLog" (
    "id" TEXT NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "findings" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTier" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReviewLog_sheetId_idx" ON "AiReviewLog"("sheetId");

-- CreateIndex
CREATE INDEX "AiReviewLog_decision_idx" ON "AiReviewLog"("decision");

-- CreateIndex
CREATE INDEX "AiReviewLog_createdAt_idx" ON "AiReviewLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AiReviewLog" ADD CONSTRAINT "AiReviewLog_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
