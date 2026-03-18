const bcrypt = require('bcryptjs')
const { captureError } = require('../monitoring/sentry')
const { SCHOOLS, COURSES } = require('./catalogData')
const { createPrismaClient } = require('./prisma')

const DEFAULT_ADMIN_EMAIL = 'abdulrfornah@getstudyhub.org'

const SCHEMA_REPAIR_STATEMENTS = [
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationCode" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpiry" TIMESTAMP(3)',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3)',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFaCode" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFaExpiry" TIMESTAMP(3)',
  `UPDATE "User"
   SET "email" = NULLIF(LOWER(BTRIM("email")), '')
   WHERE "email" IS NOT NULL`,
  `UPDATE "User"
   SET
     "emailVerified" = false,
     "emailVerificationCode" = NULL,
     "emailVerificationExpiry" = NULL,
     "twoFaEnabled" = false,
     "twoFaCode" = NULL,
     "twoFaExpiry" = NULL
   WHERE "email" IS NULL`,
  `WITH "duplicateEmails" AS (
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
      "emailVerificationCode" = NULL,
      "emailVerificationExpiry" = NULL,
      "twoFaEnabled" = false,
      "twoFaCode" = NULL,
      "twoFaExpiry" = NULL
    FROM "duplicateEmails" AS "dupe"
    WHERE "target"."id" = "dupe"."id"
      AND "dupe"."rowNum" > 1`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")',

  `CREATE TABLE IF NOT EXISTS "RequestedCourse" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "schoolId" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 1,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestedCourse_pkey" PRIMARY KEY ("id")
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "RequestedCourse_name_schoolId_key" ON "RequestedCourse"("name", "schoolId")',

  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "downloads" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "stars" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "forks" INTEGER NOT NULL DEFAULT 0',
  `ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT ''`,
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "attachmentType" TEXT',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "allowDownloads" BOOLEAN NOT NULL DEFAULT true',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "htmlScanStatus" TEXT NOT NULL DEFAULT \'queued\'',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "htmlScanFindings" JSONB',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "htmlScanUpdatedAt" TIMESTAMP(3)',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "htmlScanAcknowledgedAt" TIMESTAMP(3)',
  'ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "htmlOriginalArchivedAt" TIMESTAMP(3)',
  `CREATE TABLE IF NOT EXISTS "SheetHtmlVersion" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceName" TEXT,
    "content" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "compressionAlgo" TEXT,
    "compressedContent" BYTEA,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetHtmlVersion_pkey" PRIMARY KEY ("id")
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "SheetHtmlVersion_sheetId_kind_key" ON "SheetHtmlVersion"("sheetId", "kind")',
  'CREATE INDEX IF NOT EXISTS "SheetHtmlVersion_kind_updatedAt_idx" ON "SheetHtmlVersion"("kind", "updatedAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "SheetHtmlVersion_archivedAt_updatedAt_idx" ON "SheetHtmlVersion"("archivedAt", "updatedAt" DESC)',

  `CREATE TABLE IF NOT EXISTS "Note" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "private" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "actorId" INTEGER,
    "sheetId" INTEGER,
    "linkPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "UserFollow" (
    "followerId" INTEGER NOT NULL,
    "followingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("followerId","followingId")
  )`,
  `CREATE TABLE IF NOT EXISTS "Reaction" (
    "userId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("userId","sheetId")
  )`,
  `CREATE TABLE IF NOT EXISTS "DeletionReason" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletionReason_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Comment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "StarredSheet" (
    "userId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    CONSTRAINT "StarredSheet_pkey" PRIMARY KEY ("userId","sheetId")
  )`,
  `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FeedPost" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "attachmentName" TEXT,
    "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FeedPostComment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedPostComment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FeedPostReaction" (
    "userId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "FeedPostReaction_pkey" PRIMARY KEY ("userId","postId")
  )`,
  `CREATE TABLE IF NOT EXISTS "SheetContribution" (
    "id" SERIAL NOT NULL,
    "targetSheetId" INTEGER NOT NULL,
    "forkSheetId" INTEGER NOT NULL,
    "proposerId" INTEGER NOT NULL,
    "reviewerId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "SheetContribution_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "VerificationChallenge" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "payload" JSONB,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationChallenge_pkey" PRIMARY KEY ("id")
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "StarredSheet_userId_sheetId_key" ON "StarredSheet"("userId", "sheetId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "VerificationChallenge_token_key" ON "VerificationChallenge"("token")',
  'CREATE INDEX IF NOT EXISTS "VerificationChallenge_purpose_userId_expiresAt_idx" ON "VerificationChallenge"("purpose", "userId", "expiresAt")',
  'CREATE INDEX IF NOT EXISTS "VerificationChallenge_purpose_username_expiresAt_idx" ON "VerificationChallenge"("purpose", "username", "expiresAt")',
  'CREATE INDEX IF NOT EXISTS "VerificationChallenge_purpose_email_expiresAt_idx" ON "VerificationChallenge"("purpose", "email", "expiresAt")',
  'CREATE INDEX IF NOT EXISTS "VerificationChallenge_purpose_verifiedAt_expiresAt_idx" ON "VerificationChallenge"("purpose", "verifiedAt", "expiresAt")',
  'CREATE INDEX IF NOT EXISTS "SheetContribution_targetSheetId_status_idx" ON "SheetContribution"("targetSheetId", "status")',
  'CREATE INDEX IF NOT EXISTS "SheetContribution_proposerId_status_idx" ON "SheetContribution"("proposerId", "status")',
  'CREATE INDEX IF NOT EXISTS "StudySheet_createdAt_idx" ON "StudySheet"("createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "StudySheet_courseId_createdAt_idx" ON "StudySheet"("courseId", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "StudySheet_userId_createdAt_idx" ON "StudySheet"("userId", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "StudySheet_htmlScanStatus_updatedAt_idx" ON "StudySheet"("htmlScanStatus", "updatedAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "Comment_sheetId_createdAt_idx" ON "Comment"("sheetId", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "Announcement_pinned_createdAt_idx" ON "Announcement"("pinned", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "FeedPost_createdAt_idx" ON "FeedPost"("createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "FeedPost_userId_createdAt_idx" ON "FeedPost"("userId", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "FeedPost_courseId_createdAt_idx" ON "FeedPost"("courseId", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "FeedPostComment_postId_createdAt_idx" ON "FeedPostComment"("postId", "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "FeedPostReaction_postId_type_idx" ON "FeedPostReaction"("postId", "type")',

  'ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "Note_userId_fkey"',
  'ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "Note_courseId_fkey"',
  'ALTER TABLE "Note" ADD CONSTRAINT "Note_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE',

  'ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey"',
  'ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_actorId_fkey"',
  'ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE',

  'ALTER TABLE "UserFollow" DROP CONSTRAINT IF EXISTS "UserFollow_followerId_fkey"',
  'ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "UserFollow" DROP CONSTRAINT IF EXISTS "UserFollow_followingId_fkey"',
  'ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_userId_fkey"',
  'ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_sheetId_fkey"',
  'ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_sheetId_fkey"',
  'ALTER TABLE "Comment" ADD CONSTRAINT "Comment_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_userId_fkey"',
  'ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "StarredSheet" DROP CONSTRAINT IF EXISTS "StarredSheet_userId_fkey"',
  'ALTER TABLE "StarredSheet" ADD CONSTRAINT "StarredSheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "StarredSheet" DROP CONSTRAINT IF EXISTS "StarredSheet_sheetId_fkey"',
  'ALTER TABLE "StarredSheet" ADD CONSTRAINT "StarredSheet_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_userId_fkey"',
  'ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "Announcement" DROP CONSTRAINT IF EXISTS "Announcement_authorId_fkey"',
  'ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE',

  'ALTER TABLE "FeedPost" DROP CONSTRAINT IF EXISTS "FeedPost_userId_fkey"',
  'ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "FeedPost" DROP CONSTRAINT IF EXISTS "FeedPost_courseId_fkey"',
  'ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE',

  'ALTER TABLE "FeedPostComment" DROP CONSTRAINT IF EXISTS "FeedPostComment_postId_fkey"',
  'ALTER TABLE "FeedPostComment" ADD CONSTRAINT "FeedPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "FeedPostComment" DROP CONSTRAINT IF EXISTS "FeedPostComment_userId_fkey"',
  'ALTER TABLE "FeedPostComment" ADD CONSTRAINT "FeedPostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "FeedPostReaction" DROP CONSTRAINT IF EXISTS "FeedPostReaction_userId_fkey"',
  'ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "FeedPostReaction" DROP CONSTRAINT IF EXISTS "FeedPostReaction_postId_fkey"',
  'ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  'ALTER TABLE "SheetContribution" DROP CONSTRAINT IF EXISTS "SheetContribution_targetSheetId_fkey"',
  'ALTER TABLE "SheetContribution" ADD CONSTRAINT "SheetContribution_targetSheetId_fkey" FOREIGN KEY ("targetSheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "SheetContribution" DROP CONSTRAINT IF EXISTS "SheetContribution_forkSheetId_fkey"',
  'ALTER TABLE "SheetContribution" ADD CONSTRAINT "SheetContribution_forkSheetId_fkey" FOREIGN KEY ("forkSheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "SheetContribution" DROP CONSTRAINT IF EXISTS "SheetContribution_proposerId_fkey"',
  'ALTER TABLE "SheetContribution" ADD CONSTRAINT "SheetContribution_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "SheetContribution" DROP CONSTRAINT IF EXISTS "SheetContribution_reviewerId_fkey"',
  'ALTER TABLE "SheetContribution" ADD CONSTRAINT "SheetContribution_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE',
  'ALTER TABLE "VerificationChallenge" DROP CONSTRAINT IF EXISTS "VerificationChallenge_userId_fkey"',
  'ALTER TABLE "VerificationChallenge" ADD CONSTRAINT "VerificationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "SheetHtmlVersion" DROP CONSTRAINT IF EXISTS "SheetHtmlVersion_sheetId_fkey"',
  'ALTER TABLE "SheetHtmlVersion" ADD CONSTRAINT "SheetHtmlVersion_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "SheetHtmlVersion" DROP CONSTRAINT IF EXISTS "SheetHtmlVersion_userId_fkey"',
  'ALTER TABLE "SheetHtmlVersion" ADD CONSTRAINT "SheetHtmlVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',

  // v1.5.0 — Google OAuth columns
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT',
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT 'local'`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId")',
]

async function repairRuntimeSchema(prisma) {
  for (const statement of SCHEMA_REPAIR_STATEMENTS) {
    await prisma.$executeRawUnsafe(statement)
  }
}

async function ensureCatalogData(prisma) {
  const existingSchools = await prisma.school.findMany({
    select: {
      id: true,
      name: true,
      short: true,
      courses: {
        select: { code: true },
      },
    },
  })

  const schoolsByShort = new Map(
    existingSchools.map((school) => [school.short.toUpperCase(), school])
  )

  let schoolsCreated = 0
  let schoolsUpdated = 0
  let coursesCreated = 0

  for (const school of SCHOOLS) {
    const short = school.short.toUpperCase()
    let currentSchool = schoolsByShort.get(short)

    if (!currentSchool) {
      currentSchool = await prisma.school.create({
        data: {
          name: school.name,
          short: school.short,
        },
      })
      currentSchool.courses = []
      schoolsByShort.set(short, currentSchool)
      schoolsCreated += 1
    } else if (currentSchool.name !== school.name) {
      currentSchool = await prisma.school.update({
        where: { id: currentSchool.id },
        data: { name: school.name, short: school.short },
        select: {
          id: true,
          name: true,
          short: true,
          courses: { select: { code: true } },
        },
      })
      schoolsByShort.set(short, currentSchool)
      schoolsUpdated += 1
    }

    const targetCourses = COURSES[short] || COURSES.DEFAULT || []
    const existingCodes = new Set(
      (currentSchool.courses || []).map((course) => String(course.code).toUpperCase())
    )
    const missingCourses = targetCourses.filter(
      (course) => !existingCodes.has(String(course.code).toUpperCase())
    )

    if (missingCourses.length > 0) {
      await prisma.course.createMany({
        data: missingCourses.map((course) => ({
          schoolId: currentSchool.id,
          code: course.code,
          name: course.name,
        })),
      })
      coursesCreated += missingCourses.length
    }
  }

  if (schoolsCreated || schoolsUpdated || coursesCreated) {
    console.log(
      `Catalog bootstrap complete: ${schoolsCreated} schools created, ${schoolsUpdated} schools updated, ${coursesCreated} courses created.`
    )
  }
}

async function ensureAdminUser(prisma) {
  const username = (process.env.ADMIN_USERNAME || '').trim()
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''

  if (!username) {
    return false
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      role: true,
      email: true,
      emailVerified: true,
    },
  })

  const nextPasswordHash = password
    ? await bcrypt.hash(password, 12)
    : null

  if (!existingUser) {
    if (!nextPasswordHash) {
      console.warn(
        'Skipping admin bootstrap because ADMIN_PASSWORD is not set for a new admin account.'
      )
      return false
    }

    await prisma.user.create({
      data: {
        username,
        passwordHash: nextPasswordHash,
        role: 'admin',
        email: email || null,
        emailVerified: Boolean(email),
      },
      select: { id: true },
    })
    console.log('Admin bootstrap created the admin account.')
    return true
  }

  const updates = {}

  if (existingUser.role !== 'admin') {
    updates.role = 'admin'
  }

  if (email && existingUser.email !== email) {
    updates.email = email
    updates.emailVerified = true
  } else if (email && !existingUser.emailVerified) {
    updates.emailVerified = true
  }

  if (nextPasswordHash) {
    updates.passwordHash = nextPasswordHash
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: updates,
      select: { id: true },
    })
    console.log('Admin bootstrap synced the admin account.')
    return true
  }

  return false
}

async function bootstrapRuntime() {
  const prisma = createPrismaClient()

  try {
    await repairRuntimeSchema(prisma)
    await ensureCatalogData(prisma)
    await ensureAdminUser(prisma)
  } catch (error) {
    captureError(error, { source: 'bootstrapRuntime' })
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  bootstrapRuntime,
  ensureAdminUser,
  ensureCatalogData,
  repairRuntimeSchema,
}
