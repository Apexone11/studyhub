-- Add missing auth/profile columns expected by the current Prisma schema.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- Keep the schema's unique email constraint in sync with production.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
