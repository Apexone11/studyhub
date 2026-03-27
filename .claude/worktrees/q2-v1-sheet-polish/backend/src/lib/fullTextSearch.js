const prisma = require('./prisma')

/**
 * Build a tsquery-safe search string from user input.
 * Removes special tsquery characters, splits words, and joins with &.
 */
function sanitizeSearchQuery(input) {
  return String(input || '').trim()
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
async function searchSheetsFTS(query, { courseId, userId, status = 'published', page = 1, limit = 20 } = {}) {
  const tsquery = sanitizeSearchQuery(query)
  if (!tsquery) return { sheets: [], total: 0, page, totalPages: 0 }

  const conditions = [`s."status" = $1`]
  const params = [status]
  let paramIdx = 2

  if (courseId) {
    conditions.push(`s."courseId" = $${paramIdx}`)
    params.push(Number(courseId))
    paramIdx++
  }

  if (userId) {
    conditions.push(`s."userId" = $${paramIdx}`)
    params.push(Number(userId))
    paramIdx++
  }

  const whereClause = conditions.join(' AND ')
  const tsqueryParam = `$${paramIdx}`
  params.push(tsquery)

  const countParams = [...params]
  const countResult = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total FROM "StudySheet" s
     WHERE ${whereClause}
     AND to_tsvector('english', coalesce(s."title", '') || ' ' || coalesce(s."description", '') || ' ' || coalesce(s."content", ''))
     @@ to_tsquery('english', ${tsqueryParam})`,
    ...countParams
  )

  const offset = (page - 1) * limit
  const limitParam = `$${paramIdx + 1}`
  const offsetParam = `$${paramIdx + 2}`
  const dataParams = [...params, limit, offset]

  const sheets = await prisma.$queryRawUnsafe(
    `SELECT s."id", s."title", s."description", s."contentFormat", s."status",
            s."stars", s."downloads", s."forks", s."createdAt", s."updatedAt",
            s."courseId", s."userId", s."forkOf"
     FROM "StudySheet" s
     WHERE ${whereClause}
     AND to_tsvector('english', coalesce(s."title", '') || ' ' || coalesce(s."description", '') || ' ' || coalesce(s."content", ''))
     @@ to_tsquery('english', ${tsqueryParam})
     ORDER BY ts_rank(to_tsvector('english', coalesce(s."title", '') || ' ' || coalesce(s."description", '') || ' ' || coalesce(s."content", '')),
                      to_tsquery('english', ${tsqueryParam})) DESC, s."createdAt" DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    ...dataParams
  )

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

  return prisma.$queryRawUnsafe(
    `SELECT c."id", c."code", c."name", c."schoolId"
     FROM "Course" c
     WHERE to_tsvector('english', c."name") @@ to_tsquery('english', $1)
        OR to_tsvector('english', c."code") @@ to_tsquery('english', $1)
     ORDER BY c."code" ASC
     LIMIT $2`,
    tsquery,
    limit
  )
}

/**
 * Full-text search for users using GIN indexes.
 */
async function searchUsersFTS(query, { limit = 20 } = {}) {
  const tsquery = sanitizeSearchQuery(query)
  if (!tsquery) return []

  return prisma.$queryRawUnsafe(
    `SELECT u."id", u."username", u."role", u."avatarUrl", u."createdAt"
     FROM "User" u
     WHERE to_tsvector('english', u."username") @@ to_tsquery('english', $1)
     ORDER BY u."username" ASC
     LIMIT $2`,
    tsquery,
    limit
  )
}

module.exports = {
  sanitizeSearchQuery,
  searchSheetsFTS,
  searchCoursesFTS,
  searchUsersFTS,
}
