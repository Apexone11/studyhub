#!/usr/bin/env node
/**
 * seedLibrarySyncQueries.js — Seed the LibrarySyncState rotation pool.
 *
 * Roughly 50 query variants drawn from academic categories, textbook
 * keywords, study guide keywords, and well-known author seeds. Run
 * once at deploy time; idempotent (upsert-on-queryKey).
 *
 * Master plan §3.3 + L1-LOW-5.
 */

require('../src/lib/loadEnv')
const prisma = require('../src/lib/prisma')

// Categories aligned with Google Books `subject:` filter.
const CATEGORIES = [
  'Mathematics',
  'Computer Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Engineering',
  'Economics',
  'Statistics',
  'Philosophy',
  'History',
  'Literature',
  'Psychology',
  'Sociology',
  'Anthropology',
  'Linguistics',
  'Political Science',
  'Law',
  'Medicine',
  'Nursing',
  'Public Health',
  'Astronomy',
  'Geology',
  'Architecture',
  'Education',
  'Business',
  'Finance',
  'Marketing',
  'Accounting',
  'Music',
  'Art',
  'Film',
  'Religion',
  'Drama',
  'Poetry',
  'Earth Science',
  'Environmental Studies',
]

// Keyword seeds bias toward textbook + study guide content rather than
// novels.
const KEYWORD_SEEDS = [
  'textbook',
  'study guide',
  'introduction to',
  'fundamentals of',
  'principles of',
  'handbook of',
  'review',
  'lecture notes',
  'companion to',
  'encyclopedia of',
  'dictionary of',
  'open textbook',
  'university press',
]

function buildQueries() {
  const out = new Set()
  for (const cat of CATEGORIES) {
    out.add(`subject:${cat}`)
  }
  for (const kw of KEYWORD_SEEDS) {
    out.add(kw)
  }
  return Array.from(out)
}

async function main() {
  const queries = buildQueries()
  let inserted = 0
  let skipped = 0
  for (const q of queries) {
    const existing = await prisma.librarySyncState.findUnique({ where: { queryKey: q } })
    if (existing) {
      skipped += 1
      continue
    }
    await prisma.librarySyncState.create({
      data: {
        queryKey: q,
        lastStartIndex: 0,
        totalFetched: 0,
        capDiscovered: false,
      },
    })
    inserted += 1
  }
  console.warn(
    `[library-sync] Seeded ${inserted} query keys (${skipped} already existed; ${queries.length} total).`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error('[library-sync] seed failed:', err)
  process.exit(1)
})
