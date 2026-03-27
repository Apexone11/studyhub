-- AlterTable
ALTER TABLE "StudySheet" ADD COLUMN "reviewedById" INTEGER;
ALTER TABLE "StudySheet" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "StudySheet" ADD COLUMN "reviewReason" TEXT;
ALTER TABLE "StudySheet" ADD COLUMN "reviewFindingsSnapshot" JSONB;

-- AddForeignKey
ALTER TABLE "StudySheet" ADD CONSTRAINT "StudySheet_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
