-- Add missing auth/profile columns expected by the current Prisma schema.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- Normalize any historical email values before adding uniqueness protection.
UPDATE "User"
SET "email" = NULLIF(LOWER(BTRIM("email")), '')
WHERE "email" IS NOT NULL;

-- If duplicate emails already exist, keep the first user record and clear the
-- duplicates so deploy-time indexing doesn't fail on inconsistent legacy data.
WITH "duplicateEmails" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id") AS "rowNum"
  FROM "User"
  WHERE "email" IS NOT NULL
)
UPDATE "User" AS "target"
SET
  "email" = NULL,
  "emailVerified" = false,
  "twoFaEnabled" = false,
  "twoFaCode" = NULL,
  "twoFaExpiry" = NULL
FROM "duplicateEmails" AS "dupe"
WHERE "target"."id" = "dupe"."id"
  AND "dupe"."rowNum" > 1;

-- Keep the schema's unique email constraint in sync with production.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
