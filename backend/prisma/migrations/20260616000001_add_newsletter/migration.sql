-- Newsletter / Product-Updates ("What's New") — issue #291.
-- Idempotent + re-runnable per CLAUDE.md A5 (IF NOT EXISTS + guarded FKs).

CREATE TABLE IF NOT EXISTS "Newsletter" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "bodyHtml" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'announcement',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "emailRecipientCount" INTEGER NOT NULL DEFAULT 0,
  "authorId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Newsletter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NewsletterSend" (
  "id" SERIAL NOT NULL,
  "newsletterId" INTEGER NOT NULL,
  "userId" INTEGER,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterSend_pkey" PRIMARY KEY ("id")
);

-- Consent flag. Opt-out default (existing users receive product updates).
ALTER TABLE "UserPreferences"
  ADD COLUMN IF NOT EXISTS "emailProductUpdates" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "Newsletter_slug_key" ON "Newsletter"("slug");
CREATE INDEX IF NOT EXISTS "Newsletter_status_publishedAt_idx"
  ON "Newsletter"("status", "publishedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSend_newsletterId_userId_key"
  ON "NewsletterSend"("newsletterId", "userId");
CREATE INDEX IF NOT EXISTS "NewsletterSend_newsletterId_idx"
  ON "NewsletterSend"("newsletterId");

DO $$ BEGIN
  ALTER TABLE "Newsletter" ADD CONSTRAINT "Newsletter_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NewsletterSend" ADD CONSTRAINT "NewsletterSend_newsletterId_fkey"
    FOREIGN KEY ("newsletterId") REFERENCES "Newsletter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NewsletterSend" ADD CONSTRAINT "NewsletterSend_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
