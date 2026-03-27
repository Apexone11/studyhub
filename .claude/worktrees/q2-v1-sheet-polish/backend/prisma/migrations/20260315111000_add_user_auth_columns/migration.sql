-- Add missing auth/profile columns expected by the current Prisma schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='email') THEN
    ALTER TABLE "User" ADD COLUMN "email" TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='emailVerified') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='failedAttempts') THEN
    ALTER TABLE "User" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='lockedUntil') THEN
    ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='avatarUrl') THEN
    ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
  END IF;
END $$;

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
