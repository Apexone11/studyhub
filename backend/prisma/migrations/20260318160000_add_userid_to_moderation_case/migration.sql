-- AlterTable: add userId column to ModerationCase
ALTER TABLE "ModerationCase" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ModerationCase_userId_fkey') THEN
    ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ModerationCase_userId_idx" ON "ModerationCase"("userId");
