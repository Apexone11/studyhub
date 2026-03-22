-- Repair migration: Add all columns that failed due to invalid PostgreSQL syntax
-- Previous migrations used "ADD COLUMN IF NOT EXISTS" which is MySQL, not PostgreSQL.
-- This migration uses proper DO $$ BEGIN ... END $$ blocks.

-- ═══════════════════════════════════════════════════════════════════════════
-- User table columns
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='twoFaEnabled') THEN
    ALTER TABLE "User" ADD COLUMN "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='twoFaCode') THEN
    ALTER TABLE "User" ADD COLUMN "twoFaCode" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='twoFaExpiry') THEN
    ALTER TABLE "User" ADD COLUMN "twoFaExpiry" TIMESTAMP(3);
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='emailVerificationCode') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerificationCode" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='emailVerificationExpiry') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerificationExpiry" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='googleId') THEN
    ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='authProvider') THEN
    ALTER TABLE "User" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'local';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- StudySheet table columns
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='description') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='attachmentUrl') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "attachmentUrl" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='attachmentType') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "attachmentType" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='contentFormat') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "contentFormat" TEXT NOT NULL DEFAULT 'markdown';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='status') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanStatus') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanStatus" TEXT NOT NULL DEFAULT 'queued';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanFindings') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanFindings" JSONB;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanUpdatedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanUpdatedAt" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanAcknowledgedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanAcknowledgedAt" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlOriginalArchivedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlOriginalArchivedAt" TIMESTAMP(3);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FeedPost table columns
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='FeedPost' AND column_name='attachmentName') THEN
    ALTER TABLE "FeedPost" ADD COLUMN "attachmentName" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='FeedPost' AND column_name='allowDownloads') THEN
    ALTER TABLE "FeedPost" ADD COLUMN "allowDownloads" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contribution' AND column_name='linkPath') THEN
    ALTER TABLE "Contribution" ADD COLUMN "linkPath" TEXT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- School table columns (CRITICAL — causes profile + registration 500s)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='School' AND column_name='city') THEN
    ALTER TABLE "School" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='School' AND column_name='state') THEN
    ALTER TABLE "School" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'MD';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='School' AND column_name='schoolType') THEN
    ALTER TABLE "School" ADD COLUMN "schoolType" TEXT NOT NULL DEFAULT 'public';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Course table columns
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Course' AND column_name='department') THEN
    ALTER TABLE "Course" ADD COLUMN "department" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ModerationCase table columns
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ModerationCase' AND column_name='userId') THEN
    ALTER TABLE "ModerationCase" ADD COLUMN "userId" INTEGER;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- htmlRiskTier (from latest migration, ensure it's present)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlRiskTier') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlRiskTier" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
