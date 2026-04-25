const { Prisma } = require('@prisma/client')
const prisma = require('./prisma')

const SHEET_SEARCH_VECTOR = Prisma.sql`to_tsvector('english', coalesce(s."title", '') || ' ' || coalesce(s."description", '') || ' ' || coalesce(s."content", ''))`

function buildSheetWhereSql({ status, courseId, userId }) {
  let whereSql = Prisma.sql`s."status" = ${status}`

  if (courseId) {
    whereSql = Prisma.sql`${whereSql} AND s."courseId" = ${Number(courseId)}`
  }

  if (userId) {
    whereSql = Prisma.sql`${whereSql} AND s."userId" = ${Number(userId)}`
  }

  return whereSql
}

/**
 * Build a tsquery-safe search string from user input.
 * Removes special tsquery characters, splits words, and joins with &.
 */
function sanitizeSearchQuery(input) {
  // Cap input length to prevent ReDoS on extremely long tsquery strings.
  return String(input || '')
    .trim()
    .slice(0, 500)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(Boolean)
    .join(' & ')
}

/**
 * Full-text search for sheets using GIN indexes.
 * Uses PostgreSQL to_tsvector / to_tsquery for ranked search results.
 */
async function searchSheetsFTS(
  query,
  { courseId, userId, status = 'published', page = 1, limit = 20 } = {},
) {
  const tsquery = sanitizeSearchQuery(query)
  if (!tsquery) return { sheets: [], total: 0, page, totalPages: 0 }

  const whereSql = buildSheetWhereSql({ status, courseId, userId })
  const searchConditionSql = Prisma.sql`${SHEET_SEARCH_VECTOR} @@ to_tsquery('english', ${tsquery})`

  const countResult = await prisma.$queryRaw`
    SELECT COUNT(*)::int as total
    FROM "StudySheet" s
    WHERE ${whereSql}
      AND ${searchConditionSql}
  `

  const offset = (page - 1) * limit

  const sheets = await prisma.$queryRaw`
    SELECT s."id", s."title", s."description", s."contentFormat", s."status",
           s."stars", s."downloads", s."forks", s."createdAt", s."updatedAt",
           s."courseId", s."userId", s."forkOf"
    FROM "StudySheet" s
    WHERE ${whereSql}
      AND ${searchConditionSql}
    ORDER BY ts_rank(${SHEET_SEARCH_VECTOR}, to_tsquery('english', ${tsquery})) DESC,
             s."createdAt" DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `

  const total = countResult[0]?.total ?? 0

  return {
    sheets,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * Full-text search for courses using GIN indexes.
 */
async function searchCoursesFTS(query, { limit = 20 } = {}) {
  const tsquery = sanitizeSearchQuery(query)
  if (!tsquery) return []

  return prisma.$queryRaw`
    SELECT c."id", c."code", c."name", c."schoolId"
    FROM "Course" c
    WHERE to_tsvector('english', c."name") @@ to_tsquery('english', ${tsquery})
       OR to_tsvector('english', c."code") @@ to_tsquery('english', ${tsquery})
    ORDER BY c."code" ASC
    LIMIT ${Number(limit)}
  `
}

/**
 * Full-text search for users using GIN indexes.
 */
async function searchUsersFTS(query, { limit = 20 } = {}) {
  const tsquery = sanitizeSearchQuery(query)
  if (!tsquery) return []

  return prisma.$queryRaw`
    SELECT u."id", u."username", u."role", u."avatarUrl", u."createdAt"
    FROM "User" u
    WHERE to_tsvector('english', u."username") @@ to_tsquery('english', ${tsquery})
    ORDER BY u."username" ASC
    LIMIT ${Number(limit)}
  `
}

module.exports = {
  sanitizeSearchQuery,
  searchSheetsFTS,
  searchCoursesFTS,
  searchUsersFTS,
}
