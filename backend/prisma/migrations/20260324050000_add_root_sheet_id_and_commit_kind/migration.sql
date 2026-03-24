-- AlterTable: add rootSheetId to StudySheet (nullable, points to the ultimate original)
ALTER TABLE "StudySheet" ADD COLUMN "rootSheetId" INTEGER;

-- AlterTable: add kind to SheetCommit (snapshot, fork_base, restore, merge)
ALTER TABLE "SheetCommit" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'snapshot';
