/**
 * sweepInactiveSessions.js — revoke sessions that have been dormant for 30 days.
 *
 * Runs as a cron (daily is plenty). Reduces the attack surface of abandoned
 * browsers / forgotten devices. Expired sessions (past their 24h TTL) are
 * handled separately by session.service.js cleanupExpiredSessions().
 *
 * Usage: node scripts/sweepInactiveSessions.js [--days 30]
 */

const prisma = require('../src/lib/prisma')

const DEFAULT_DAYS = 30

function parseDaysArg() {
  const idx = process.argv.findIndex((a) => a === '--days')
  if (idx === -1) return DEFAULT_DAYS
  const v = parseInt(process.argv[idx + 1], 10)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAYS
}

async function main() {
  const days = parseDaysArg()
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const result = await prisma.session.updateMany({
    where: {
      revokedAt: null,
      lastActiveAt: { lt: cutoff },
    },
    data: { revokedAt: new Date() },
  })

  console.log(
    `[sweepInactiveSessions] revoked ${result.count} sessions inactive since ${cutoff.toISOString()}`,
  )
}

main()
  .catch((err) => {
    console.error('[sweepInactiveSessions] failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
