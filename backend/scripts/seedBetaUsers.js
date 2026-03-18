const path = require('node:path')
const bcrypt = require('bcryptjs')
const { createPrismaClient } = require('../src/lib/prisma')
const { assertLocalDatabase } = require('./assertLocalDatabase')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const prisma = createPrismaClient()

function getBetaUsers() {
  return [
    {
      username: process.env.BETA_OWNER_USERNAME || 'studyhub_owner',
      email: process.env.BETA_OWNER_EMAIL || 'studyhub_owner@studyhub.local',
      password: process.env.BETA_OWNER_PASSWORD || 'AdminPass123',
      role: 'admin',
    },
    {
      username: process.env.BETA_ADMIN_USERNAME || 'beta_admin',
      email: process.env.BETA_ADMIN_EMAIL || 'beta_admin@studyhub.local',
      password: process.env.BETA_ADMIN_PASSWORD || 'BetaAdmin123!',
      role: 'admin',
    },
    {
      username: process.env.BETA_STUDENT1_USERNAME || 'beta_student1',
      email: process.env.BETA_STUDENT1_EMAIL || 'beta_student1@studyhub.local',
      password: process.env.BETA_STUDENT1_PASSWORD || 'BetaStudent123!',
      role: 'student',
    },
    {
      username: process.env.BETA_STUDENT2_USERNAME || 'beta_student2',
      email: process.env.BETA_STUDENT2_EMAIL || 'beta_student2@studyhub.local',
      password: process.env.BETA_STUDENT2_PASSWORD || 'BetaStudent123!',
      role: 'student',
    },
  ]
}

async function upsertBetaUser(userSpec) {
  const passwordHash = await bcrypt.hash(userSpec.password, 12)
  return prisma.user.upsert({
    where: { username: userSpec.username },
    update: {
      email: userSpec.email.toLowerCase(),
      role: userSpec.role,
      passwordHash,
      emailVerified: true,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: false,
      twoFaCode: null,
      twoFaExpiry: null,
    },
    create: {
      username: userSpec.username,
      email: userSpec.email.toLowerCase(),
      role: userSpec.role,
      passwordHash,
      emailVerified: true,
    },
  })
}

async function seedEnrollments(studentUserIds) {
  const courses = await prisma.course.findMany({
    select: { id: true },
    take: 2,
    orderBy: { id: 'asc' },
  })

  if (courses.length === 0) {
    console.warn('No courses found while seeding beta enrollments. Run `npm run seed` first.')
    return
  }

  for (const userId of studentUserIds) {
    await prisma.enrollment.createMany({
      data: courses.map((course) => ({ userId, courseId: course.id })),
      skipDuplicates: true,
    })
  }
}

async function seedFeedFixture(studentUserId) {
  const existing = await prisma.feedPost.findFirst({
    where: {
      userId: studentUserId,
      content: 'beta-diagnostics-fixture',
    },
    select: { id: true },
  })

  if (existing) return

  await prisma.feedPost.create({
    data: {
      userId: studentUserId,
      content: 'beta-diagnostics-fixture',
    },
  })
}

async function main() {
  assertLocalDatabase('beta test-user seed')
  const specs = getBetaUsers()

  const users = []
  for (const spec of specs) {
    const user = await upsertBetaUser(spec)
    users.push({ ...user, password: spec.password })
  }

  const studentUserIds = users.filter((user) => user.role === 'student').map((user) => user.id)
  await seedEnrollments(studentUserIds)
  if (studentUserIds.length > 0) {
    await seedFeedFixture(studentUserIds[0])
  }

  console.log('Local beta users are ready:')
  for (const user of users) {
    console.log(`- ${user.role.padEnd(7)} ${user.username} (password set)`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
