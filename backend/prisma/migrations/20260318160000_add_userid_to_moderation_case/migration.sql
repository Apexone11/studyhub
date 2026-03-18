-- AlterTable: add userId column to ModerationCase
ALTER TABLE "ModerationCase" ADD COLUMN "userId" INTEGER;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ModerationCase_userId_idx" ON "ModerationCase"("userId");
