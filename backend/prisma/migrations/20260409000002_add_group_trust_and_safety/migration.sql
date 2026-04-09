-- Phase 5: Study group trust & safety
--
-- One migration covers every Phase 5 schema change so we don't end up
-- with a dozen tiny migration folders. All ALTER TABLE statements are
-- additive and backfill with safe defaults; existing rows keep working.

-- ─────────────────────────────────────────────────────────────────
-- StudyGroup: moderation columns + per-group feature toggles
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "StudyGroup"
    ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "StudyGroup" ADD COLUMN "warnedUntil" TIMESTAMP(3);
ALTER TABLE "StudyGroup" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "StudyGroup" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "StudyGroup" ADD COLUMN "deletedById" INTEGER;
ALTER TABLE "StudyGroup"
    ADD COLUMN "memberListPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudyGroup"
    ADD COLUMN "requirePostApproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StudyGroup"
    ADD CONSTRAINT "StudyGroup_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StudyGroup_moderationStatus_idx"
    ON "StudyGroup"("moderationStatus");
CREATE INDEX "StudyGroup_deletedAt_idx" ON "StudyGroup"("deletedAt");

-- ─────────────────────────────────────────────────────────────────
-- StudyGroupMember: join-gate message, mute window, strike counter
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "StudyGroupMember"
    ADD COLUMN "joinMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StudyGroupMember" ADD COLUMN "mutedUntil" TIMESTAMP(3);
ALTER TABLE "StudyGroupMember"
    ADD COLUMN "mutedReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StudyGroupMember" ADD COLUMN "mutedById" INTEGER;
ALTER TABLE "StudyGroupMember" ADD COLUMN "lastStrikeAt" TIMESTAMP(3);
ALTER TABLE "StudyGroupMember"
    ADD COLUMN "strikeCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StudyGroupMember"
    ADD CONSTRAINT "StudyGroupMember_mutedById_fkey"
    FOREIGN KEY ("mutedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StudyGroupMember_mutedUntil_idx"
    ON "StudyGroupMember"("mutedUntil");

-- ─────────────────────────────────────────────────────────────────
-- GroupDiscussionPost: moderation status + removal columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "GroupDiscussionPost"
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "GroupDiscussionPost" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "GroupDiscussionPost" ADD COLUMN "removedById" INTEGER;

-- ─────────────────────────────────────────────────────────────────
-- GroupReport
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "GroupReport" (
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

CREATE UNIQUE INDEX "GroupReport_groupId_reporterId_key"
    ON "GroupReport"("groupId", "reporterId");
CREATE INDEX "GroupReport_status_createdAt_idx"
    ON "GroupReport"("status", "createdAt");
CREATE INDEX "GroupReport_groupId_status_idx"
    ON "GroupReport"("groupId", "status");
CREATE INDEX "GroupReport_reporterId_status_idx"
    ON "GroupReport"("reporterId", "status");

ALTER TABLE "GroupReport"
    ADD CONSTRAINT "GroupReport_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupReport"
    ADD CONSTRAINT "GroupReport_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupReport"
    ADD CONSTRAINT "GroupReport_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- GroupAppeal
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "GroupAppeal" (
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

CREATE UNIQUE INDEX "GroupAppeal_groupId_appealerId_key"
    ON "GroupAppeal"("groupId", "appealerId");
CREATE INDEX "GroupAppeal_status_createdAt_idx"
    ON "GroupAppeal"("status", "createdAt");

ALTER TABLE "GroupAppeal"
    ADD CONSTRAINT "GroupAppeal_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupAppeal"
    ADD CONSTRAINT "GroupAppeal_appealerId_fkey"
    FOREIGN KEY ("appealerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupAppeal"
    ADD CONSTRAINT "GroupAppeal_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- GroupAuditLog
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "GroupAuditLog" (
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

CREATE INDEX "GroupAuditLog_groupId_createdAt_idx"
    ON "GroupAuditLog"("groupId", "createdAt" DESC);
CREATE INDEX "GroupAuditLog_actorId_createdAt_idx"
    ON "GroupAuditLog"("actorId", "createdAt" DESC);
CREATE INDEX "GroupAuditLog_action_idx" ON "GroupAuditLog"("action");

ALTER TABLE "GroupAuditLog"
    ADD CONSTRAINT "GroupAuditLog_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupAuditLog"
    ADD CONSTRAINT "GroupAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- GroupBlock
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "GroupBlock" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "blockedById" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupBlock_groupId_userId_key"
    ON "GroupBlock"("groupId", "userId");
CREATE INDEX "GroupBlock_userId_idx" ON "GroupBlock"("userId");

ALTER TABLE "GroupBlock"
    ADD CONSTRAINT "GroupBlock_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupBlock"
    ADD CONSTRAINT "GroupBlock_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupBlock"
    ADD CONSTRAINT "GroupBlock_blockedById_fkey"
    FOREIGN KEY ("blockedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
