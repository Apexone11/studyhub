/**
 * Admin Growth Controller -- activation funnel, referral stats, and observability summary.
 *
 * GET /activation-funnel      -- Onboarding funnel, activation rate, cohort breakdown
 * GET /referral-stats         -- Referral totals, channel breakdown, top inviters, K-factor
 * GET /observability/summary  -- Route latency percentiles, error rates, placeholder vitals
 */
const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')

const router = express.Router()

const STEP_LABELS = {
  1: 'Welcome',
  2: 'Select School',
  3: 'Add Courses',
  4: 'Profile Setup',
  5: 'First Action',
  6: 'Invite Peers',
  7: 'Complete',
}

const TOTAL_STEPS = 7

/**
 * Parse period query param into a start Date.
 * Supports 24h, 7d, 30d, 90d. Defaults to 30d.
 */
function periodToStartDate(period) {
  const map = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }
  const days = map[period] || 30
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Format a Date to ISO week string (e.g. "2026-W15").
 */
function toISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// ── GET /activation-funnel ──────────────────────────────
router.get('/activation-funnel', async (req, res) => {
  const period = req.query.period || '30d'
  const startDate = periodToStartDate(period)

  try {
    const rows = await prisma.onboardingProgress.findMany({
      where: { createdAt: { gte: startDate } },
      select: {
        currentStep: true,
        completedAt: true,
        firstActionType: true,
        createdAt: true,
      },
    })

    // -- Funnel: count how many users reached each step --
    const funnel = []
    for (let step = 1; step <= TOTAL_STEPS; step++) {
      const reached = rows.filter((r) => r.currentStep >= step || r.completedAt !== null).length
      const completed = rows.filter((r) => r.currentStep > step || r.completedAt !== null).length
      funnel.push({
        step,
        label: STEP_LABELS[step] || `Step ${step}`,
        reached,
        completed,
      })
    }

    // -- Activation rate: completed AND took a first action --
    const totalRows = rows.length
    const activatedCount = rows.filter(
      (r) => r.completedAt !== null && r.firstActionType !== null,
    ).length
    const activationRate =
      totalRows > 0 ? Math.round((activatedCount / totalRows) * 1000) / 1000 : 0

    // -- Median time-to-first-sheet (hours) --
    // Approximate: completed rows with firstActionType, sorted by (completedAt - createdAt)
    const durations = rows
      .filter((r) => r.completedAt !== null && r.firstActionType !== null)
      .map((r) => (r.completedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60))
      .sort((a, b) => a - b)

    let medianTimeToFirstSheet = null
    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2)
      medianTimeToFirstSheet =
        durations.length % 2 === 0
          ? Math.round(((durations[mid - 1] + durations[mid]) / 2) * 10) / 10
          : Math.round(durations[mid] * 10) / 10
    }

    // -- Cohort by week --
    const cohortMap = new Map()
    for (const r of rows) {
      const week = toISOWeek(r.createdAt)
      if (!cohortMap.has(week)) {
        cohortMap.set(week, { signups: 0, activated: 0 })
      }
      const entry = cohortMap.get(week)
      entry.signups++
      if (r.completedAt !== null && r.firstActionType !== null) {
        entry.activated++
      }
    }

    const cohorts = Array.from(cohortMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        signups: data.signups,
        activated: data.activated,
        rate: data.signups > 0 ? Math.round((data.activated / data.signups) * 1000) / 1000 : 0,
      }))

    res.json({
      funnel,
      activationRate,
      medianTimeToFirstSheet,
      cohorts,
    })
  } catch (err) {
    // Graceful degradation if table does not exist
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json({
        funnel: [],
        activationRate: 0,
        medianTimeToFirstSheet: null,
        cohorts: [],
      })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /referral-stats ─────────────────────────────────
router.get('/referral-stats', async (req, res) => {
  const period = req.query.period || '30d'
  const startDate = periodToStartDate(period)

  try {
    // Fetch referrals and rewards in parallel
    const [referrals, rewardsCount, totalUsers] = await Promise.all([
      prisma.referral.findMany({
        where: { sentAt: { gte: startDate } },
        select: {
          id: true,
          inviterId: true,
          channel: true,
          acceptedAt: true,
          sentAt: true,
          inviter: { select: { username: true } },
        },
      }),
      prisma.referralReward.count({
        where: { grantedAt: { gte: startDate } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: startDate } },
      }),
    ])

    const totalSent = referrals.length
    const totalAccepted = referrals.filter((r) => r.acceptedAt !== null).length
    const acceptanceRate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 1000) / 1000 : 0
    // K-factor = (invites sent per user) * (acceptance rate)
    const kFactor =
      totalUsers > 0 ? Math.round((totalSent / totalUsers) * acceptanceRate * 100) / 100 : 0

    // -- Channel breakdown --
    const channelMap = new Map()
    for (const r of referrals) {
      if (!channelMap.has(r.channel)) {
        channelMap.set(r.channel, { sent: 0, accepted: 0 })
      }
      const entry = channelMap.get(r.channel)
      entry.sent++
      if (r.acceptedAt !== null) entry.accepted++
    }
    const channelBreakdown = Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      sent: data.sent,
      accepted: data.accepted,
    }))

    // -- Top 20 inviters --
    const inviterMap = new Map()
    for (const r of referrals) {
      if (!inviterMap.has(r.inviterId)) {
        inviterMap.set(r.inviterId, {
          userId: r.inviterId,
          username: r.inviter?.username || 'unknown',
          sent: 0,
          accepted: 0,
        })
      }
      const entry = inviterMap.get(r.inviterId)
      entry.sent++
      if (r.acceptedAt !== null) entry.accepted++
    }
    const inviterList = Array.from(inviterMap.values())
      .sort((a, b) => b.accepted - a.accepted)
      .slice(0, 20)

    // Flag anomalous inviters: acceptance rate > 200% of the median
    const inviterRates = inviterList
      .filter((inv) => inv.sent > 0)
      .map((inv) => inv.accepted / inv.sent)
      .sort((a, b) => a - b)

    let medianRate = 0
    if (inviterRates.length > 0) {
      const mid = Math.floor(inviterRates.length / 2)
      medianRate =
        inviterRates.length % 2 === 0
          ? (inviterRates[mid - 1] + inviterRates[mid]) / 2
          : inviterRates[mid]
    }
    const anomalyThreshold = medianRate * 2

    const topInviters = inviterList.map((inv) => ({
      userId: inv.userId,
      username: inv.username,
      sent: inv.sent,
      accepted: inv.accepted,
      flagged: inv.sent > 0 && inv.accepted / inv.sent > anomalyThreshold && anomalyThreshold > 0,
    }))

    // -- Weekly K-factor --
    const weeklyMap = new Map()
    for (const r of referrals) {
      const week = toISOWeek(r.sentAt)
      if (!weeklyMap.has(week)) {
        weeklyMap.set(week, { sent: 0, accepted: 0 })
      }
      const entry = weeklyMap.get(week)
      entry.sent++
      if (r.acceptedAt !== null) entry.accepted++
    }
    const weeklyKFactor = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => {
        const weekAcceptance = data.sent > 0 ? data.accepted / data.sent : 0
        const weekK =
          totalUsers > 0 ? Math.round((data.sent / totalUsers) * weekAcceptance * 100) / 100 : 0
        return { week, kFactor: weekK }
      })

    res.json({
      totals: {
        sent: totalSent,
        accepted: totalAccepted,
        acceptanceRate,
        kFactor,
        rewardsGranted: rewardsCount,
      },
      channelBreakdown,
      topInviters,
      weeklyKFactor,
    })
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json({
        totals: { sent: 0, accepted: 0, acceptanceRate: 0, kFactor: 0, rewardsGranted: 0 },
        channelBreakdown: [],
        topInviters: [],
        weeklyKFactor: [],
      })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /observability/summary ──────────────────────────────────
router.get('/observability/summary', async (req, res) => {
  const period = req.query.period || '24h'
  const startDate = periodToStartDate(period)

  try {
    // Route-level latency percentiles and error rates via raw SQL
    const routeGroups = await prisma.$queryRaw`
      SELECT
        "routeGroup",
        COUNT(*)::int as "requestCount",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs") as p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs") as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "durationMs") as p99,
        COUNT(*) FILTER (WHERE "statusCode" >= 500)::float / NULLIF(COUNT(*), 0) as "errorRate"
      FROM "RequestMetric"
      WHERE "createdAt" > ${startDate}
      GROUP BY "routeGroup"
      ORDER BY "routeGroup"
    `

    const formattedGroups = routeGroups.map((row) => ({
      group: row.routeGroup,
      p50: row.p50 !== null ? Math.round(Number(row.p50) * 10) / 10 : null,
      p95: row.p95 !== null ? Math.round(Number(row.p95) * 10) / 10 : null,
      p99: row.p99 !== null ? Math.round(Number(row.p99) * 10) / 10 : null,
      requestCount: Number(row.requestCount),
      errorRate: row.errorRate !== null ? Math.round(Number(row.errorRate) * 10000) / 10000 : 0,
    }))

    res.json({
      period,
      routeGroups: formattedGroups,
      // AI Time-To-First-Token -- placeholder; real TTFT data comes from PostHog
      aiTtft: { p50: null, p95: null, sampleCount: 0 },
      // Web Vitals -- placeholder; real data comes from PostHog client-side events
      webVitals: {
        LCP: { p50: null, p95: null },
        INP: { p50: null, p95: null },
        CLS: { p50: null, p95: null },
      },
    })
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json({
        period,
        routeGroups: [],
        aiTtft: { p50: null, p95: null, sampleCount: 0 },
        webVitals: {
          LCP: { p50: null, p95: null },
          INP: { p50: null, p95: null },
          CLS: { p50: null, p95: null },
        },
      })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
