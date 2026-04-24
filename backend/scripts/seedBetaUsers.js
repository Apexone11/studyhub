/**
 * seedBetaUsers.js — local beta test-user + fixture seed.
 *
 * Per CLAUDE.md §11 (Working Agreement For AI Agents), every feature
 * that adds a UI surface should include a seed update so
 * `npm run seed:beta` produces a localhost state where the feature
 * is visible end-to-end for beta_student1 without manual data setup.
 *
 * Flag seed policy (ratified 2026-04-24): the seed MUST track the
 * ship frontier, not every declared design_v2_* flag.
 *
 *   - SHIPPED features inherit an explicit enabled=true row so they
 *     render and are visible in the admin flag UI.
 *   - IN-FLIGHT features get an explicit enabled=false row. This
 *     opts them out of the client-side FLAG_NOT_FOUND fail-open
 *     behavior, which would otherwise silently turn unreleased
 *     features on whenever the DB row was missing.
 *
 * The two lists are maintained in `SHIPPED_DESIGN_V2_FLAGS` and
 * `IN_FLIGHT_DESIGN_V2_FLAGS` further down in this file. When a
 * phase ships, move its flag name between the two arrays — don't
 * re-flip the whole set.
 */

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
      profileVisibility: 'public',
    },
    {
      username: process.env.BETA_ADMIN_USERNAME || 'beta_admin',
      email: process.env.BETA_ADMIN_EMAIL || 'beta_admin@studyhub.local',
      password: process.env.BETA_ADMIN_PASSWORD || 'BetaAdmin123!',
      role: 'admin',
      profileVisibility: 'public',
    },
    {
      username: process.env.BETA_STUDENT1_USERNAME || 'beta_student1',
      email: process.env.BETA_STUDENT1_EMAIL || 'beta_student1@studyhub.local',
      password: process.env.BETA_STUDENT1_PASSWORD || 'BetaStudent123!',
      role: 'student',
      profileVisibility: 'enrolled',
    },
    {
      username: process.env.BETA_STUDENT2_USERNAME || 'beta_student2',
      email: process.env.BETA_STUDENT2_EMAIL || 'beta_student2@studyhub.local',
      password: process.env.BETA_STUDENT2_PASSWORD || 'BetaStudent123!',
      role: 'student',
      profileVisibility: 'public',
    },
    {
      username: process.env.BETA_STUDENT3_USERNAME || 'beta_student3',
      email: process.env.BETA_STUDENT3_EMAIL || 'beta_student3@studyhub.local',
      password: process.env.BETA_STUDENT3_PASSWORD || 'BetaStudent123!',
      role: 'student',
      profileVisibility: 'public',
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

async function seedProfilePreferences(users) {
  for (const user of users) {
    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: {
        profileVisibility: user.profileVisibility || 'public',
      },
      create: {
        userId: user.id,
        profileVisibility: user.profileVisibility || 'public',
      },
    })
  }
}

async function seedEnrollments(studentUsers) {
  const courses = await prisma.course.findMany({
    select: { id: true },
    take: 2,
    orderBy: { id: 'asc' },
  })

  if (courses.length === 0) {
    console.warn('No courses found while seeding beta enrollments. Run `npm run seed` first.')
    return
  }

  await prisma.enrollment.deleteMany({
    where: {
      userId: { in: studentUsers.map((user) => user.id) },
    },
  })

  const sharedStudentUsernames = new Set([
    process.env.BETA_STUDENT1_USERNAME || 'beta_student1',
    process.env.BETA_STUDENT2_USERNAME || 'beta_student2',
  ])

  for (const user of studentUsers) {
    if (!sharedStudentUsernames.has(user.username)) {
      continue
    }

    await prisma.enrollment.createMany({
      data: courses.map((course) => ({ userId: user.id, courseId: course.id })),
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

/**
 * Seed upcoming exams for beta_student1 so the UpcomingExamsCard on
 * /users/beta_student1?tab=overview renders a happy-path card out of
 * the box — no curl, no Prisma Studio, no manual setup.
 *
 * Codifies the "every feature must ship with seed data" rule added to
 * CLAUDE.md §Working-Agreement #11 during the Day 3 smoke-test
 * regression. See docs/internal/audits/2026-04-24-day3-polish-and-
 * ship-handoff.md.
 *
 * Idempotent: uses a stable (userId, title) de-dupe so re-running
 * `npm run seed:beta` doesn't pile up duplicate rows.
 */
async function seedUpcomingExams(studentUsers) {
  const primary =
    studentUsers.find(
      (u) => u.username === (process.env.BETA_STUDENT1_USERNAME || 'beta_student1'),
    ) || null
  if (!primary) return

  const enrollments = await prisma.enrollment.findMany({
    where: { userId: primary.id },
    include: { course: { select: { id: true, code: true, name: true } } },
    take: 2,
  })

  if (enrollments.length === 0) {
    console.warn(
      `No enrollments found for ${primary.username}; skipping upcoming-exam seed. ` +
        'Re-run after courses are seeded.',
    )
    return
  }

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const fixtures = [
    {
      courseId: enrollments[0].courseId,
      title: `${enrollments[0].course.code} Midterm`,
      location: 'ITE 231',
      examDate: new Date(now + 11 * day),
      notes: 'Covers chapters 1–6. Bring a calculator.',
      // Middle of the progress range so the UpcomingExamsCard bar
      // shows something more interesting than 0 or 100.
      preparednessPercent: 62,
    },
  ]
  // If the second course is available, queue a longer-horizon exam so
  // the card renders more than one row.
  if (enrollments[1]) {
    fixtures.push({
      courseId: enrollments[1].courseId,
      title: `${enrollments[1].course.code} Final`,
      location: 'Engineering 027',
      examDate: new Date(now + 45 * day),
      notes: 'Comprehensive. Three hours.',
      // Further-out exam, lower preparedness — makes the "got
      // farther to go" state visible on the card.
      preparednessPercent: 20,
    })
  }

  for (const fixture of fixtures) {
    const existing = await prisma.courseExam.findFirst({
      where: { userId: primary.id, title: fixture.title },
      select: { id: true },
    })
    if (existing) {
      await prisma.courseExam.update({
        where: { id: existing.id },
        data: {
          courseId: fixture.courseId,
          location: fixture.location,
          examDate: fixture.examDate,
          notes: fixture.notes,
          preparednessPercent: fixture.preparednessPercent,
        },
      })
    } else {
      await prisma.courseExam.create({
        data: {
          userId: primary.id,
          courseId: fixture.courseId,
          title: fixture.title,
          location: fixture.location,
          examDate: fixture.examDate,
          notes: fixture.notes,
          preparednessPercent: fixture.preparednessPercent,
        },
      })
    }
  }
}

/**
 * Seed design_v2_* FeatureFlag rows with a SCOPE THAT MATCHES WHAT
 * HAS ACTUALLY SHIPPED.
 *
 * Policy (ratified 2026-04-24 after a Day 2->3 scope-drift incident
 * where every design_v2_* flag was seeded enabled=true, which flipped
 * on Phase 3/4/5+ in-flight features on localhost and broke the
 * "Phase 3 opens after Day 3 closes" rule):
 *
 *   SHIPPED flags  → enabled=true row. These features are live on
 *                    main / local-main and should render when the
 *                    flag is evaluated. Explicit row beats fail-open
 *                    and shows up in the admin flag UI so an operator
 *                    can flip it off.
 *
 *   IN-FLIGHT flags → enabled=false row. The frontend hook treats
 *                    FLAG_NOT_FOUND as fail-open (so a missing row
 *                    would SILENTLY TURN THE FEATURE ON). An explicit
 *                    enabled=false row opts the WIP surface out of
 *                    that fail-open behavior. When each phase ships,
 *                    the corresponding row gets flipped to true (or
 *                    deleted, which falls back to fail-open = on).
 *
 * Convention reinforced in CLAUDE.md §11 — the seed MUST track the
 * ship frontier, not every declared flag.
 */

const SHIPPED_DESIGN_V2_FLAGS = [
  // Phase 1 — shipped 2026-04-23. Sectioned AppSidebar + welcome hero
  // + top-contributors widget on UserProfilePage.
  'design_v2_phase1_dashboard',
  // Phase 2 — shipped 2026-04-24 (this cycle). UpcomingExamsCard +
  // /api/exams CRUD end-to-end.
  'design_v2_upcoming_exams',
]

const IN_FLIGHT_DESIGN_V2_FLAGS = [
  // Phase 3 — inline Hub AI suggestion card. Not greenlit yet.
  'design_v2_ai_card',
  // Phase 4 — Sheets Grid/List toggle + preview. Needs `previewText`
  // schema column first.
  'design_v2_sheets_grid',
  // Phase 5 — Auth split layout + referral banner.
  'design_v2_auth_split',
  // Phase 6 — Onboarding polish.
  'design_v2_onboarding',
  // Phase 7 — Feed density + swipe gestures.
  'design_v2_feed_polish',
  // Phase 8 — Public home hero + for-role cards.
  'design_v2_home_hero',
  // Week 2/3 tracks — TeachMaterials page, public docs, study-groups
  // polish, role checklist, weekly focus widget, teacher sections.
  // Code scaffolding exists for each; none has been explicitly
  // greenlit as "shipped" by the founder. If the re-walk after this
  // change surfaces a feature that IS actually live in production,
  // promote the specific flag from this list to SHIPPED_DESIGN_V2_FLAGS
  // — don't re-flip the whole set.
  'design_v2_teach_materials',
  'design_v2_docs_public',
  'design_v2_groups_polish',
  'design_v2_role_checklist',
  'design_v2_weekly_focus',
  'design_v2_teach_sections',
]

async function seedDesignV2Flags() {
  for (const name of SHIPPED_DESIGN_V2_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { name },
      update: { enabled: true, rolloutPercentage: 100 },
      create: {
        name,
        description: 'Design refresh v2 — SHIPPED. Explicit enabled=true for local beta.',
        enabled: true,
        rolloutPercentage: 100,
      },
    })
  }

  for (const name of IN_FLIGHT_DESIGN_V2_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { name },
      update: { enabled: false, rolloutPercentage: 0 },
      create: {
        name,
        description:
          'Design refresh v2 — IN-FLIGHT. Explicit enabled=false to opt out of fail-open until the phase ships.',
        enabled: false,
        rolloutPercentage: 0,
      },
    })
  }
}

async function main() {
  assertLocalDatabase('beta test-user seed')
  const specs = getBetaUsers()

  const users = []
  for (const spec of specs) {
    const user = await upsertBetaUser(spec)
    users.push({ ...user, password: spec.password, profileVisibility: spec.profileVisibility })
  }

  await seedProfilePreferences(users)

  const studentUsers = users.filter((user) => user.role === 'student')
  const studentUserIds = studentUsers.map((user) => user.id)
  await seedEnrollments(studentUsers)
  if (studentUserIds.length > 0) {
    await seedFeedFixture(studentUserIds[0])
  }
  await seedUpcomingExams(studentUsers)
  await seedDesignV2Flags()

  console.log('Local beta users are ready:')
  for (const user of users) {
    console.log(`- ${user.role.padEnd(7)} ${user.username} (password set)`)
  }
  console.log('Seeded upcoming exams + design_v2_* feature flags for local beta.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
