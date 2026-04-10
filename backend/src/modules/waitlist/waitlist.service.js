/**
 * waitlist.service.js — Waitlist business logic.
 *
 * Handles: signup with email confirmation, admin list/stats/export/invite,
 * and in-app notification for logged-in users who join the waitlist.
 */
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')

const VALID_TIERS = ['pro', 'institution']
const VALID_STATUSES = ['waiting', 'invited', 'converted', 'removed']

/**
 * Add an email to the waitlist. Returns the row.
 * Throws shaped errors for validation failures and duplicates.
 */
async function addToWaitlist({ email, tier }) {
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 320) {
    const err = new Error('Invalid email address.')
    err.status = 400
    throw err
  }
  if (!VALID_TIERS.includes(tier)) {
    const err = new Error('Tier must be "pro" or "institution".')
    err.status = 400
    throw err
  }

  try {
    return await prisma.waitlist.create({
      data: { email: email.trim().toLowerCase(), tier },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      const dup = new Error('You are already on the waitlist.')
      dup.status = 409
      dup.code = 'DUPLICATE'
      throw dup
    }
    throw err
  }
}

/**
 * Paginated list with optional filters.
 */
async function listWaitlist({ status, tier, search, limit = 50, offset = 0 }) {
  const where = {}
  if (status && VALID_STATUSES.includes(status)) where.status = status
  if (tier && VALID_TIERS.includes(tier)) where.tier = tier
  if (search) {
    where.email = { contains: search.toLowerCase(), mode: 'insensitive' }
  }

  const [rows, total] = await Promise.all([
    prisma.waitlist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.waitlist.count({ where }),
  ])
  return { entries: rows, total, limit, offset }
}

/**
 * Aggregate stats for the admin dashboard.
 */
async function getWaitlistStats() {
  const [total, byTier, byStatus, recentDaily] = await Promise.all([
    prisma.waitlist.count(),
    prisma.waitlist.groupBy({ by: ['tier'], _count: { _all: true } }),
    prisma.waitlist.groupBy({ by: ['status'], _count: { _all: true } }),
    // Signups per day for the last 30 days
    prisma.$queryRaw`
      SELECT DATE("createdAt") as day, COUNT(*)::int as count
      FROM "Waitlist"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY day DESC
    `.catch(() => []),
  ])

  const tierMap = Object.fromEntries(byTier.map((r) => [r.tier, r._count._all]))
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]))

  return {
    total,
    pro: tierMap.pro || 0,
    institution: tierMap.institution || 0,
    waiting: statusMap.waiting || 0,
    invited: statusMap.invited || 0,
    converted: statusMap.converted || 0,
    removed: statusMap.removed || 0,
    dailySignups: recentDaily,
  }
}

/**
 * Export full waitlist as an array of { email, tier, status, createdAt }.
 */
async function exportWaitlist() {
  return prisma.waitlist.findMany({
    select: { email: true, tier: true, status: true, createdAt: true, invitedAt: true },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Mark a single entry as invited + stamp invitedAt.
 */
async function inviteEntry(id) {
  return prisma.waitlist.update({
    where: { id },
    data: { status: 'invited', invitedAt: new Date() },
  })
}

/**
 * Batch invite: mark the first N 'waiting' entries of a given tier as invited.
 * Returns the count of entries updated.
 */
async function inviteBatch({ tier, count = 50 }) {
  if (!VALID_TIERS.includes(tier)) {
    const err = new Error('Invalid tier.')
    err.status = 400
    throw err
  }

  const candidates = await prisma.waitlist.findMany({
    where: { tier, status: 'waiting' },
    orderBy: { createdAt: 'asc' },
    take: Math.min(count, 500),
    select: { id: true },
  })

  if (candidates.length === 0) return { invited: 0 }

  const ids = candidates.map((c) => c.id)
  const result = await prisma.waitlist.updateMany({
    where: { id: { in: ids } },
    data: { status: 'invited', invitedAt: new Date() },
  })

  return { invited: result.count, ids }
}

/**
 * Remove (soft: set status to 'removed') a waitlist entry.
 */
async function removeEntry(id) {
  return prisma.waitlist.update({
    where: { id },
    data: { status: 'removed' },
  })
}

module.exports = {
  VALID_TIERS,
  VALID_STATUSES,
  addToWaitlist,
  listWaitlist,
  getWaitlistStats,
  exportWaitlist,
  inviteEntry,
  inviteBatch,
  removeEntry,
}
