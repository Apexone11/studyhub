-- Phase 5: Study group trust & safety
--
-- One migration covers every Phase 5 schema change. Every statement is
-- idempotency-guarded per CLAUDE.md A5: ADD COLUMN uses IF NOT EXISTS,
-- ADD CONSTRAINT wraps in DO $$ EXCEPTION WHEN duplicate_object, indexes
-- use IF NOT EXISTS, tables use CREATE TABLE IF NOT EXISTS. Re-running
-- this migration on a partially-applied or fully-applied database is a
-- no-op rather than an error.

-- ─────────────────────────────────────────────────────────────────
-- StudyGroup: moderation columns + per-group feature toggles
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "moderationStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "warnedUntil" TIMESTAMP(3);
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "deletedById" INTEGER;
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "memberListPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudyGroup" ADD COLUMN IF NOT EXISTS "requirePostApproval" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
    ALTER TABLE "StudyGroup"
        ADD CONSTRAINT "StudyGroup_deletedById_fkey"
        FOREIGN KEY ("deletedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "StudyGroup_moderationStatus_idx"
    ON "StudyGroup"("moderationStatus");
CREATE INDEX IF NOT EXISTS "StudyGroup_deletedAt_idx" ON "StudyGroup"("deletedAt");

-- ─────────────────────────────────────────────────────────────────
-- StudyGroupMember: join-gate message, mute window, strike counter
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "StudyGroupMember" ADD COLUMN IF NOT EXISTS "joinMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StudyGroupMember" ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3);
ALTER TABLE "StudyGroupMember" ADD COLUMN IF NOT EXISTS "mutedReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StudyGroupMember" ADD COLUMN IF NOT EXISTS "mutedById" INTEGER;
ALTER TABLE "StudyGroupMember" ADD COLUMN IF NOT EXISTS "lastStrikeAt" TIMESTAMP(3);
ALTER TABLE "StudyGroupMember" ADD COLUMN IF NOT EXISTS "strikeCount" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    ALTER TABLE "StudyGroupMember"
        ADD CONSTRAINT "StudyGroupMember_mutedById_fkey"
        FOREIGN KEY ("mutedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "StudyGroupMember_mutedUntil_idx"
    ON "StudyGroupMember"("mutedUntil");

-- ─────────────────────────────────────────────────────────────────
-- GroupDiscussionPost: moderation status + removal columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "GroupDiscussionPost" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "GroupDiscussionPost" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
ALTER TABLE "GroupDiscussionPost" ADD COLUMN IF NOT EXISTS "removedById" INTEGER;

-- ─────────────────────────────────────────────────────────────────
-- GroupReport
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GroupReport" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "resolution" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupReport_groupId_reporterId_key"
    ON "GroupReport"("groupId", "reporterId");
CREATE INDEX IF NOT EXISTS "GroupReport_status_createdAt_idx"
    ON "GroupReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "GroupReport_groupId_status_idx"
    ON "GroupReport"("groupId", "status");
CREATE INDEX IF NOT EXISTS "GroupReport_reporterId_status_idx"
    ON "GroupReport"("reporterId", "status");

DO $$ BEGIN
    ALTER TABLE "GroupReport"
        ADD CONSTRAINT "GroupReport_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupReport"
        ADD CONSTRAINT "GroupReport_reporterId_fkey"
        FOREIGN KEY ("reporterId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupReport"
        ADD CONSTRAINT "GroupReport_resolvedById_fkey"
        FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────
-- GroupAppeal
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GroupAppeal" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "appealerId" INTEGER NOT NULL,
    "originalAction" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "resolution" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAppeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupAppeal_groupId_appealerId_key"
    ON "GroupAppeal"("groupId", "appealerId");
CREATE INDEX IF NOT EXISTS "GroupAppeal_status_createdAt_idx"
    ON "GroupAppeal"("status", "createdAt");

DO $$ BEGIN
    ALTER TABLE "GroupAppeal"
        ADD CONSTRAINT "GroupAppeal_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupAppeal"
        ADD CONSTRAINT "GroupAppeal_appealerId_fkey"
        FOREIGN KEY ("appealerId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupAppeal"
        ADD CONSTRAINT "GroupAppeal_resolvedById_fkey"
        FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────
-- GroupAuditLog
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GroupAuditLog" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" INTEGER,
    "context" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GroupAuditLog_groupId_createdAt_idx"
    ON "GroupAuditLog"("groupId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "GroupAuditLog_actorId_createdAt_idx"
    ON "GroupAuditLog"("actorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "GroupAuditLog_action_idx" ON "GroupAuditLog"("action");

DO $$ BEGIN
    ALTER TABLE "GroupAuditLog"
        ADD CONSTRAINT "GroupAuditLog_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupAuditLog"
        ADD CONSTRAINT "GroupAuditLog_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────
-- GroupBlock
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GroupBlock" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "blockedById" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupBlock_groupId_userId_key"
    ON "GroupBlock"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "GroupBlock_userId_idx" ON "GroupBlock"("userId");

DO $$ BEGIN
    ALTER TABLE "GroupBlock"
        ADD CONSTRAINT "GroupBlock_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupBlock"
        ADD CONSTRAINT "GroupBlock_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GroupBlock"
        ADD CONSTRAINT "GroupBlock_blockedById_fkey"
        FOREIGN KEY ("blockedById") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
