-- Migration: roles-and-permissions Wave 4 schema (see docs/roles-and-permissions-plan.md §9)
-- No-op for existing users; all new fields default to NULL and new tables start empty.

-- AlterTable: Add role-revert and learning-goal fields to User
ALTER TABLE "User" ADD COLUMN "previousAccountType" TEXT;
ALTER TABLE "User" ADD COLUMN "roleRevertDeadline" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "learningGoal" VARCHAR(500);

-- CreateTable: RoleChangeLog (audit + rate-cap source for 3 changes / 30 days rule)
CREATE TABLE "RoleChangeLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromAccountType" TEXT NOT NULL,
    "toAccountType" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "wasRevert" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoleChangeLog_userId_idx" ON "RoleChangeLog"("userId");
CREATE INDEX "RoleChangeLog_userId_changedAt_idx" ON "RoleChangeLog"("userId", "changedAt");
CREATE INDEX "RoleChangeLog_changedAt_idx" ON "RoleChangeLog"("changedAt");

ALTER TABLE "RoleChangeLog" ADD CONSTRAINT "RoleChangeLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: UserEnrollmentArchive (enables enrollment restoration on revert)
CREATE TABLE "UserEnrollmentArchive" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL DEFAULT 'role_change',

    CONSTRAINT "UserEnrollmentArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserEnrollmentArchive_userId_idx" ON "UserEnrollmentArchive"("userId");
CREATE INDEX "UserEnrollmentArchive_userId_archivedAt_idx" ON "UserEnrollmentArchive"("userId", "archivedAt");

ALTER TABLE "UserEnrollmentArchive" ADD CONSTRAINT "UserEnrollmentArchive_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Hashtag (topic taxonomy; referenced by HashtagFollow)
CREATE TABLE "Hashtag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Hashtag_name_key" ON "Hashtag"("name");
CREATE INDEX "Hashtag_name_idx" ON "Hashtag"("name");

-- CreateTable: HashtagFollow (user -> hashtag; powers Self-learner interest feeds)
CREATE TABLE "HashtagFollow" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "hashtagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HashtagFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HashtagFollow_userId_hashtagId_key" ON "HashtagFollow"("userId", "hashtagId");
CREATE INDEX "HashtagFollow_userId_idx" ON "HashtagFollow"("userId");
CREATE INDEX "HashtagFollow_hashtagId_idx" ON "HashtagFollow"("hashtagId");

ALTER TABLE "HashtagFollow" ADD CONSTRAINT "HashtagFollow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HashtagFollow" ADD CONSTRAINT "HashtagFollow_hashtagId_fkey"
    FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: LearningGoal (history; only the latest is shown in UI)
CREATE TABLE "LearningGoal" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "goal" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearningGoal_userId_idx" ON "LearningGoal"("userId");
CREATE INDEX "LearningGoal_userId_createdAt_idx" ON "LearningGoal"("userId", "createdAt");

ALTER TABLE "LearningGoal" ADD CONSTRAINT "LearningGoal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
