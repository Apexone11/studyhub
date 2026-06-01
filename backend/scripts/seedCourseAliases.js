/**
 * seedCourseAliases.js — G2-4 curated topic catalog + course→topic aliases.
 *
 * Idempotent (upsert-only, safe in any environment). Seeds the
 * `TopicCanonical` catalog (CIP-coded) and maps existing `Course` rows to
 * topics by keyword so cross-school search + "Equivalent at other schools"
 * have real data. Skips gracefully when no courses exist yet.
 *
 * Runs inside the `seed:beta` chain (seedBetaUsers.js) and standalone:
 *   node backend/scripts/seedCourseAliases.js
 *
 * See docs/internal/plans/g2-4-course-aliasing.md.
 */
const path = require('node:path')

// Curated topic catalog. `cipCode` = NCES CIP 6-digit (program-level grouping
// hint, not an exact course key). `match` keywords test the course
// code/name/department (case-insensitive).
const TOPICS = [
  {
    topicTag: 'cs-intro',
    displayName: 'Intro to Programming',
    category: 'cs',
    cipCode: '11.0701',
    match: [
      'cmsc13',
      'cmsc20',
      'cs61a',
      'cs101',
      'cs1',
      '6.0001',
      'intro to programming',
      'computer science i',
      'programming i',
    ],
  },
  {
    topicTag: 'cs-data-structures',
    displayName: 'Data Structures',
    category: 'cs',
    cipCode: '11.0701',
    match: ['cmsc132', 'cmsc202', 'cs61b', 'cs2', 'data structures'],
  },
  {
    topicTag: 'calc-1',
    displayName: 'Calculus I',
    category: 'math',
    cipCode: '27.0101',
    match: ['math140', 'math151', 'math1a', 'calc1', 'calculus i', 'calculus 1'],
  },
  {
    topicTag: 'calc-2',
    displayName: 'Calculus II',
    category: 'math',
    cipCode: '27.0101',
    match: ['math141', 'math152', 'math1b', 'calc2', 'calculus ii', 'calculus 2'],
  },
  {
    topicTag: 'linear-algebra',
    displayName: 'Linear Algebra',
    category: 'math',
    cipCode: '27.0101',
    match: ['math240', 'math221', 'linear algebra'],
  },
  {
    topicTag: 'general-biology-1',
    displayName: 'General Biology I',
    category: 'bio',
    cipCode: '26.0101',
    match: ['biol10', 'biol14', 'bio1', 'general biology', 'biology i'],
  },
  {
    topicTag: 'general-chemistry-1',
    displayName: 'General Chemistry I',
    category: 'chem',
    cipCode: '40.0501',
    match: ['chem13', 'chem10', 'chem1', 'general chemistry', 'chemistry i'],
  },
  {
    topicTag: 'general-physics-1',
    displayName: 'General Physics I',
    category: 'physics',
    cipCode: '40.0801',
    match: ['phys16', 'phys12', 'phys1', 'general physics', 'physics i'],
  },
  {
    topicTag: 'english-composition-1',
    displayName: 'English Composition I',
    category: 'english',
    cipCode: '23.1301',
    match: ['engl101', 'engl1', 'composition', 'academic writing', 'writing i'],
  },
  {
    topicTag: 'intro-psychology',
    displayName: 'Introduction to Psychology',
    category: 'psychology',
    cipCode: '42.0101',
    match: ['psyc100', 'psyc101', 'psy1', 'intro to psychology', 'general psychology'],
  },
  {
    topicTag: 'intro-statistics',
    displayName: 'Introduction to Statistics',
    category: 'math',
    cipCode: '27.0501',
    match: ['stat100', 'stat1', 'introductory statistics', 'intro to statistics'],
  },
  {
    topicTag: 'microeconomics',
    displayName: 'Principles of Microeconomics',
    category: 'economics',
    cipCode: '45.0603',
    match: ['econ200', 'econ1', 'microeconomics'],
  },
  {
    topicTag: 'macroeconomics',
    displayName: 'Principles of Macroeconomics',
    category: 'economics',
    cipCode: '45.0601',
    match: ['econ201', 'econ2', 'macroeconomics'],
  },
  {
    topicTag: 'us-history-survey',
    displayName: 'U.S. History Survey',
    category: 'history',
    cipCode: '54.0102',
    match: ['hist1', 'american history', 'u.s. history', 'us history'],
  },
  {
    topicTag: 'organic-chemistry-1',
    displayName: 'Organic Chemistry I',
    category: 'chem',
    cipCode: '40.0504',
    match: ['chem23', 'organic chemistry'],
  },
]

function matchTopic(course) {
  const hay = `${course.code} ${course.name} ${course.department || ''}`.toLowerCase()
  const tags = []
  for (const topic of TOPICS) {
    if (topic.match.some((kw) => hay.includes(kw))) tags.push(topic.topicTag)
  }
  return tags
}

async function seedCourseAliases(prisma) {
  // 1) Upsert the canonical topic catalog.
  for (const t of TOPICS) {
    await prisma.topicCanonical.upsert({
      where: { topicTag: t.topicTag },
      update: { displayName: t.displayName, category: t.category, cipCode: t.cipCode },
      create: {
        topicTag: t.topicTag,
        displayName: t.displayName,
        category: t.category,
        cipCode: t.cipCode,
      },
    })
  }

  // 2) Map existing courses to topics by keyword.
  const courses = await prisma.course.findMany({
    select: { id: true, code: true, name: true, department: true, schoolId: true },
    orderBy: { id: 'asc' },
  })
  if (courses.length === 0) {
    console.warn('Course-alias seed: no courses in DB; topic catalog seeded, 0 aliases.')
    return { topics: TOPICS.length, aliases: 0 }
  }

  let aliasCount = 0
  const topicSchools = new Map() // topicTag -> Set(schoolId), for the demo guarantee
  for (const course of courses) {
    for (const topicTag of matchTopic(course)) {
      await prisma.courseAlias.upsert({
        where: { topicTag_courseId: { topicTag, courseId: course.id } },
        update: {},
        create: { topicTag, courseId: course.id },
      })
      aliasCount += 1
      if (!topicSchools.has(topicTag)) topicSchools.set(topicTag, new Set())
      topicSchools.get(topicTag).add(course.schoolId)
    }
  }

  // 3) Demo guarantee: ensure at least one topic spans >=2 schools so the
  //    "Equivalent at other schools" view + cross-school search demo render
  //    for beta_student1. If keyword matching didn't produce a cross-school
  //    topic, alias ONE genuinely-CS-intro course from each of two schools to
  //    'cs-intro'. We must NOT alias arbitrary courses (e.g. a chemistry
  //    course) to 'cs-intro' — that produces a misleading "Equivalent at other
  //    schools" claim and pollutes cross-school search with false matches. If
  //    no course in >=2 schools plausibly matches the 'cs-intro' keywords, we
  //    skip the fallback entirely rather than fabricate a bad equivalence.
  const hasCrossSchool = [...topicSchools.values()].some((set) => set.size >= 2)
  if (!hasCrossSchool) {
    const csIntro = TOPICS.find((t) => t.topicTag === 'cs-intro')
    const csIntroHay = (course) =>
      `${course.code} ${course.name} ${course.department || ''}`.toLowerCase()
    const isCsIntro = (course) => csIntro.match.some((kw) => csIntroHay(course).includes(kw))

    // First plausible cs-intro course per school (insertion order preserves the
    // id-asc ordering from the findMany above).
    const bySchool = new Map()
    for (const c of courses) {
      if (isCsIntro(c) && !bySchool.has(c.schoolId)) bySchool.set(c.schoolId, c)
    }
    const reps = [...bySchool.values()].slice(0, 2)
    if (reps.length >= 2) {
      for (const c of reps) {
        await prisma.courseAlias.upsert({
          where: { topicTag_courseId: { topicTag: 'cs-intro', courseId: c.id } },
          update: {},
          create: { topicTag: 'cs-intro', courseId: c.id },
        })
        aliasCount += 1
      }
      console.warn(
        `Course-alias seed: keyword matching found no cross-school topic; ` +
          `aliased ${reps.length} genuine cs-intro courses across schools to 'cs-intro' for the demo.`,
      )
    } else {
      console.warn(
        `Course-alias seed: no cross-school topic and fewer than 2 schools have a ` +
          `plausible cs-intro course; skipped the demo fallback (no fabricated equivalence).`,
      )
    }
  }

  console.log(`Course-alias seed: ${TOPICS.length} topics, ${aliasCount} aliases upserted.`)
  return { topics: TOPICS.length, aliases: aliasCount }
}

module.exports = { seedCourseAliases, TOPICS }

// Standalone entry point.
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
  const { createPrismaClient } = require('../src/lib/prisma')
  const prisma = createPrismaClient()
  seedCourseAliases(prisma)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Course-alias seed failed:', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}
