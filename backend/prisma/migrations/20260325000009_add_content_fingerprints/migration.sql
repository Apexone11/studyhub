-- AlterTable: Add content fingerprint fields for plagiarism detection
ALTER TABLE "StudySheet" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "StudySheet" ADD COLUMN "contentSimhash" TEXT;

ALTER TABLE "Note" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Note" ADD COLUMN "contentSimhash" TEXT;

-- Indexes for fast exact-match and simhash lookups
CREATE INDEX "StudySheet_contentHash_idx" ON "StudySheet"("contentHash");
CREATE INDEX "StudySheet_contentSimhash_idx" ON "StudySheet"("contentSimhash");
