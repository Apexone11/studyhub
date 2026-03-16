ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "emailVerificationCode" TEXT,
ADD COLUMN IF NOT EXISTS "emailVerificationExpiry" TIMESTAMP(3);
