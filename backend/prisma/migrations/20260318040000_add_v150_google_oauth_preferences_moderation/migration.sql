-- v1.5.0-beta.1: Google OAuth fields, UserPreferences, Moderation tables

-- Google OAuth columns on User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT 'local';
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- UserPreferences table
CREATE TABLE IF NOT EXISTS "UserPreferences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "emailDigest" BOOLEAN NOT NULL DEFAULT true,
    "emailMentions" BOOLEAN NOT NULL DEFAULT true,
    "emailContributions" BOOLEAN NOT NULL DEFAULT true,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "profileVisibility" TEXT NOT NULL DEFAULT 'public',
    "defaultDownloads" BOOLEAN NOT NULL DEFAULT true,
    "defaultContributions" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "fontSize" TEXT NOT NULL DEFAULT 'medium',

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPreferences_userId_key" ON "UserPreferences"("userId");

ALTER TABLE "UserPreferences" DROP CONSTRAINT IF EXISTS "UserPreferences_userId_fkey";
ALTER TABLE "UserPreferences"
ADD CONSTRAINT "UserPreferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ModerationCase table
CREATE TABLE IF NOT EXISTS "ModerationCase" (
    "id" SERIAL NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confidence" DOUBLE PRECISION,
    "category" TEXT,
    "provider" TEXT,
    "evidence" JSONB,
    "reviewedBy" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModerationCase_status_createdAt_idx" ON "ModerationCase"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ModerationCase_contentType_contentId_idx" ON "ModerationCase"("contentType", "contentId");

ALTER TABLE "ModerationCase" DROP CONSTRAINT IF EXISTS "ModerationCase_reviewedBy_fkey";
ALTER TABLE "ModerationCase"
ADD CONSTRAINT "ModerationCase_reviewedBy_fkey"
FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Strike table
CREATE TABLE IF NOT EXISTS "Strike" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "caseId" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decayedAt" TIMESTAMP(3),

    CONSTRAINT "Strike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Strike_userId_decayedAt_expiresAt_idx" ON "Strike"("userId", "decayedAt", "expiresAt");

ALTER TABLE "Strike" DROP CONSTRAINT IF EXISTS "Strike_userId_fkey";
ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Strike" DROP CONSTRAINT IF EXISTS "Strike_caseId_fkey";
ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Appeal table
CREATE TABLE IF NOT EXISTS "Appeal" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Appeal_caseId_idx" ON "Appeal"("caseId");
CREATE INDEX IF NOT EXISTS "Appeal_userId_status_idx" ON "Appeal"("userId", "status");

ALTER TABLE "Appeal" DROP CONSTRAINT IF EXISTS "Appeal_caseId_fkey";
ALTER TABLE "Appeal"
ADD CONSTRAINT "Appeal_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appeal" DROP CONSTRAINT IF EXISTS "Appeal_userId_fkey";
ALTER TABLE "Appeal"
ADD CONSTRAINT "Appeal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appeal" DROP CONSTRAINT IF EXISTS "Appeal_reviewedBy_fkey";
ALTER TABLE "Appeal"
ADD CONSTRAINT "Appeal_reviewedBy_fkey"
FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UserRestriction table
CREATE TABLE IF NOT EXISTS "UserRestriction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "UserRestriction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserRestriction_userId_endsAt_idx" ON "UserRestriction"("userId", "endsAt");

ALTER TABLE "UserRestriction" DROP CONSTRAINT IF EXISTS "UserRestriction_userId_fkey";
ALTER TABLE "UserRestriction"
ADD CONSTRAINT "UserRestriction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
