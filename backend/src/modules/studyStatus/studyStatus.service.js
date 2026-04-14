const prisma = require('../../lib/prisma')

const VALID_STATUSES = ['to-review', 'studying', 'done']

/**
 * Get all study statuses for a user.
 * Returns a map of sheetId -> { status, updatedAt, title, courseCode }.
 */
async function getAllForUser(userId) {
  const rows = await prisma.studyStatus.findMany({
    where: { userId },
    include: {
      sheet: {
        select: {
          id: true,
          title: true,
          course: { select: { code: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const result = {}
  for (const row of rows) {
    result[row.sheetId] = {
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      title: row.sheet.title,
      courseCode: row.sheet.course?.code || null,
    }
  }
  return result
}

/**
 * Get study statuses for a batch of sheet IDs for a user.
 * Returns a map of sheetId -> status string.
 */
async function getForSheets(userId, sheetIds) {
  if (!sheetIds || sheetIds.length === 0) return {}
  const rows = await prisma.studyStatus.findMany({
    where: { userId, sheetId: { in: sheetIds } },
    select: { sheetId: true, status: true },
  })
  const result = {}
  for (const row of rows) {
    result[row.sheetId] = row.status
  }
  return result
}

/**
 * Set or clear a study status for a sheet.
 */
async function setStatus(userId, sheetId, status) {
  if (!status) {
    await prisma.studyStatus.deleteMany({ where: { userId, sheetId } })
    return null
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid study status: ${status}`)
  }

  const result = await prisma.studyStatus.upsert({
    where: { userId_sheetId: { userId, sheetId } },
    update: { status, updatedAt: new Date() },
    create: { userId, sheetId, status },
  })
  return result
}

/**
 * Bulk upsert study statuses (for initial sync from localStorage).
 * entries: { [sheetId]: { status, updatedAt? } }
 */
async function bulkSync(userId, entries) {
  const ops = []
  for (const [sheetIdStr, entry] of Object.entries(entries)) {
    const sheetId = Number(sheetIdStr)
    if (!sheetId || isNaN(sheetId)) continue
    if (!entry.status) {
      ops.push(prisma.studyStatus.deleteMany({ where: { userId, sheetId } }))
    } else if (VALID_STATUSES.includes(entry.status)) {
      ops.push(
        prisma.studyStatus.upsert({
          where: { userId_sheetId: { userId, sheetId } },
          update: { status: entry.status, updatedAt: new Date() },
          create: { userId, sheetId, status: entry.status },
        }),
      )
    }
  }
  if (ops.length > 0) {
    await prisma.$transaction(ops)
  }
}

module.exports = { getAllForUser, getForSheets, setStatus, bulkSync, VALID_STATUSES }
