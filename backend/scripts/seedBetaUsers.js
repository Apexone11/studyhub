/**
 * seedBetaUsers.js — local beta test-user + fixture seed.
 *
 * Per CLAUDE.md §11 (Working Agreement For AI Agents), every feature
 * that adds a UI surface should include a seed update so
 * `npm run seed:beta` produces a localhost state where the feature
 * is visible end-to-end for beta_student1 without manual data setup.
 *
 * Flag seed policy (decision #20, 2026-04-24, CLAUDE.md §12):
 * the client evaluates flags fail-CLOSED. Only shipped flags get a
 * DB row (via `scripts/seedFeatureFlags.js`, imported and called
 * below). In-flight flags have no row and stay off by default.
 */

const path = require('node:path')
const bcrypt = require('bcryptjs')
const { createPrismaClient } = require('../src/lib/prisma')
const { assertLocalDatabase } = require('./assertLocalDatabase')
const { seedFeatureFlags } = require('./seedFeatureFlags')
const { extractPreviewText } = require('../src/lib/sheets/extractPreviewText')

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

  // Deterministic ordering: the fixtures below pin exam titles to
  // enrollments[0] ("<code> Midterm") and enrollments[1] ("<code> Final"),
  // and seeding is idempotent on title. Without an explicit orderBy the
  // SQL row order is undefined, so a rerun could swap positions and
  // defeat the dedupe — producing duplicates instead of a stable seed.
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: primary.id },
    include: { course: { select: { id: true, code: true, name: true } } },
    orderBy: { courseId: 'asc' },
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
 * Seed beta_student1 with one plausible AiSuggestion row so localhost
 * shows the AiSuggestionCard with happy-path content out of the box.
 * Phase 3 of v2 design refresh — required by CLAUDE.md §11 (every UI
 * surface must have a seed update).
 *
 * Idempotent: dedupes on (userId, text). The fixture content is static
 * so reruns don't produce duplicate rows. The card's staleness window
 * (30 min in the service) means this seeded suggestion will be served
 * from cache until the user clicks Refresh, which is the right UX for
 * a "log in fresh and see something useful immediately" smoke test.
 */
async function seedAiSuggestions(studentUsers) {
  const primary =
    studentUsers.find(
      (u) => u.username === (process.env.BETA_STUDENT1_USERNAME || 'beta_student1'),
    ) || null
  if (!primary) return

  const fixture = {
    text: "You haven't reviewed Organic Chemistry in 3 days. Quick refresher?",
    ctaLabel: 'Open in Hub AI',
    ctaAction: 'open_chat',
  }

  const existing = await prisma.aiSuggestion.findFirst({
    where: { userId: primary.id, text: fixture.text },
    select: { id: true },
  })
  if (existing) return

  await prisma.aiSuggestion.create({
    data: {
      userId: primary.id,
      text: fixture.text,
      ctaLabel: fixture.ctaLabel,
      ctaAction: fixture.ctaAction,
    },
  })
}

/**
 * Seed published study sheets for the Sheets Grid view (Phase 4 Day 3).
 *
 * /sheets must show beta_student1 a meaningful state out of the box —
 * 6+ sheets across 3 courses, all with non-null previewText so the Grid
 * card has real preview content to render, plus at least one sheet from
 * a school OTHER than UMD so the cross-school "Search across StudyHub"
 * toggle has visible state to flip into.
 *
 * Idempotent: dedupes on (userId, title). Reruns won't pile up
 * duplicates. Uses the same `extractPreviewText` helper as the
 * create/update controllers so the seeded preview matches what a real
 * publish would produce.
 *
 * Required by CLAUDE.md §11 (Working Agreement #11): "every feature
 * that adds a new UI surface MUST include a seed update so
 * `npm run seed:beta` produces a localhost state where the feature is
 * visible end-to-end for beta_student1 without manual data setup."
 */
async function seedSheetsGridFixture(studentUsers) {
  const primary =
    studentUsers.find(
      (u) => u.username === (process.env.BETA_STUDENT1_USERNAME || 'beta_student1'),
    ) || null
  if (!primary) return

  // Pull a UMD course trio + one UMBC course. UMD is beta_student1's
  // primary school via `seedEnrollments`, so a UMBC sheet is the
  // cross-school case.
  const umd = await prisma.school.findFirst({ where: { short: 'UMD' }, select: { id: true } })
  const umbc = await prisma.school.findFirst({ where: { short: 'UMBC' }, select: { id: true } })

  if (!umd) {
    console.warn('Sheets Grid seed: UMD school missing. Run `npm --prefix backend run seed`.')
    return
  }

  const umdCourses = await prisma.course.findMany({
    where: { schoolId: umd.id },
    select: { id: true, code: true, name: true },
    orderBy: { id: 'asc' },
    take: 3,
  })
  const umbcCourse = umbc
    ? await prisma.course.findFirst({
        where: { schoolId: umbc.id },
        select: { id: true, code: true, name: true },
        orderBy: { id: 'asc' },
      })
    : null

  if (umdCourses.length < 3) {
    console.warn('Sheets Grid seed: <3 UMD courses available; skipping.')
    return
  }

  const author2 =
    studentUsers.find(
      (u) => u.username === (process.env.BETA_STUDENT2_USERNAME || 'beta_student2'),
    ) || primary
  const author3 =
    studentUsers.find(
      (u) => u.username === (process.env.BETA_STUDENT3_USERNAME || 'beta_student3'),
    ) || primary

  const fixtures = [
    {
      title: `${umdCourses[0].code} — Master Study Guide`,
      content:
        `# ${umdCourses[0].code} Study Guide\n\n## Core Concepts\nA quick-reference summary covering every chapter through midterm. ` +
        'Includes worked examples for the trickiest practice problems and a glossary of vocabulary the professor reuses on quizzes. ' +
        'Pair this with the recurrence-relations cheat sheet for week 8 prep.',
      courseId: umdCourses[0].id,
      authorId: primary.id,
      stars: 14,
      forks: 3,
      downloads: 42,
    },
    {
      title: `${umdCourses[0].code} — Quick Recursion Cheatsheet`,
      content:
        '# Recursion in One Page\n\n## Base case first\nIdentify the smallest sub-problem and write a return for it before anything else. ' +
        '## Recursive case\nReduce toward the base case on every call; never re-enter with the same args. ' +
        'Common patterns: tree traversal, divide-and-conquer, accumulator passing.',
      courseId: umdCourses[0].id,
      authorId: author2.id,
      stars: 7,
      forks: 1,
      downloads: 21,
    },
    {
      title: `${umdCourses[1].code} — Limits, Derivatives, Integrals`,
      content:
        '# Calculus Refresher\n\n## Limits\n`lim(x→a) f(x) = L` reads "as x approaches a, f(x) approaches L". ' +
        "## Power rule\n`d/dx[x^n] = n·x^(n-1)`. ## Chain rule\n`d/dx[f(g(x))] = f'(g(x)) · g'(x)`. " +
        'Last page: a one-shot reference for the most-tested integration techniques.',
      courseId: umdCourses[1].id,
      authorId: primary.id,
      stars: 22,
      forks: 5,
      downloads: 71,
    },
    {
      title: `${umdCourses[1].code} — Practice Exam Walkthrough`,
      content:
        '# Practice Exam, fully worked\n\nEvery problem from the spring practice exam, with the reasoning written out — not just the final number. ' +
        'Highlights three problems where the official answer key is misleading and explains why the cleaner setup gets the same answer faster.',
      courseId: umdCourses[1].id,
      authorId: author3.id,
      stars: 9,
      forks: 2,
      downloads: 18,
    },
    {
      title: `${umdCourses[2].code} — Lecture Notes Index`,
      content:
        '# Lecture-by-lecture index\n\nClickable bookmarks to every major concept, ordered the way the professor introduces them. ' +
        'Helps when reviewing for the cumulative final and you need to jump straight to "where did we cover dynamic programming?"',
      courseId: umdCourses[2].id,
      authorId: primary.id,
      stars: 5,
      forks: 0,
      downloads: 12,
    },
    {
      title: `${umdCourses[2].code} — Common Mistakes Recap`,
      content:
        '# 12 mistakes I made on Quiz 1\n\nIf you see yourself in any of these, fix it before the next quiz. ' +
        'Each mistake is paired with the correct approach and a one-line "what to do differently next time".',
      courseId: umdCourses[2].id,
      authorId: author2.id,
      stars: 11,
      forks: 4,
      downloads: 27,
    },
  ]

  if (umbcCourse) {
    fixtures.push({
      title: `${umbcCourse.code} — Cross-school Crossover`,
      content:
        '# A view from UMBC\n\nNotes from a parallel course at UMBC that covers similar ground. ' +
        'Useful for comparing how the same material is taught at a different school — the worked examples are different and ' +
        'often clearer. Drop this in the cross-school search to confirm the toggle works.',
      courseId: umbcCourse.id,
      authorId: author3.id,
      stars: 4,
      forks: 1,
      downloads: 9,
    })
  } else {
    console.warn(
      'Sheets Grid seed: UMBC unavailable; cross-school sheet will not be present. ' +
        'Cross-school toggle test requires a non-UMD school in the catalog.',
    )
  }

  for (const fixture of fixtures) {
    const existing = await prisma.studySheet.findFirst({
      where: { userId: fixture.authorId, title: fixture.title },
      select: { id: true },
    })
    const previewText = extractPreviewText(fixture.content)
    if (existing) {
      await prisma.studySheet.update({
        where: { id: existing.id },
        data: {
          courseId: fixture.courseId,
          content: fixture.content,
          previewText,
          stars: fixture.stars,
          forks: fixture.forks,
          downloads: fixture.downloads,
          status: 'published',
        },
      })
    } else {
      await prisma.studySheet.create({
        data: {
          title: fixture.title,
          content: fixture.content,
          previewText,
          courseId: fixture.courseId,
          userId: fixture.authorId,
          status: 'published',
          contentFormat: 'markdown',
          stars: fixture.stars,
          forks: fixture.forks,
          downloads: fixture.downloads,
        },
      })
    }
  }
}

/**
 * IN_FLIGHT_DESIGN_V2_FLAGS — DOCUMENTATION ONLY as of decision #20
 * (2026-04-24, CLAUDE.md §12).
 *
 * The client evaluates flags fail-CLOSED, so an in-flight flag's
 * behavior is correct by default: no row → disabled. There is no
 * longer any need to insert explicit `enabled=false` rows to "opt
 * out" of fail-open, because fail-open is gone.
 *
 * This list is kept as a visible roster of design_v2_* flags that
 * exist in the client's `FLAG_NAMES` but are not yet shipped. When a
 * phase ships, move its flag name into `SHIPPED_DESIGN_V2_FLAGS` in
 * `scripts/seedFeatureFlags.js` (that's what the seed acts on), and
 * remove it from here.
 */
const IN_FLIGHT_DESIGN_V2_FLAGS = [
  // Phase 5 — Auth split layout + referral banner.
  'design_v2_auth_split',
  // Phase 6 — Onboarding polish.
  'design_v2_onboarding',
  // Phase 7 — Feed density + swipe gestures.
  'design_v2_feed_polish',
  // Phase 8 — Public home hero + for-role cards.
  'design_v2_home_hero',
  // Week 2/3 tracks — TeachMaterials, public docs, study-groups
  // polish, role checklist, weekly focus, teacher sections.
  'design_v2_teach_materials',
  'design_v2_docs_public',
  'design_v2_groups_polish',
  'design_v2_role_checklist',
  'design_v2_weekly_focus',
  'design_v2_teach_sections',
  // Path A — Creator Audit consent + audit UI; backend foundation is present,
  // but no shipped flag row exists until the UI ships.
  'design_v2_creator_audit',
]

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
  await seedAiSuggestions(studentUsers)
  await seedSheetsGridFixture(studentUsers)
  await seedFeatureFlags(prisma)

  console.log('Local beta users are ready:')
  for (const user of users) {
    console.log(`- ${user.role.padEnd(7)} ${user.username} (password set)`)
  }
  console.log('Seeded upcoming exams + design_v2_* feature flags for local beta.')
}

module.exports = { IN_FLIGHT_DESIGN_V2_FLAGS }

// Only run the seed when invoked directly. This file is also imported
// for its IN_FLIGHT_DESIGN_V2_FLAGS export; requiring it should not
// trigger a DB write.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
