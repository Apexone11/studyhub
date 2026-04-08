/**
 * userBadges.js — Enrich user data with Pro/Donor badge information.
 *
 * Provides a reusable utility for attaching subscription plan and donor
 * status to user objects returned by API endpoints. This powers the
 * Pro badge and donor icons shown on UserAvatar across the frontend.
 *
 * Usage:
 *   const enriched = await enrichUsersWithBadges(users)
 *   // Each user gets: { ...user, plan: 'pro_monthly'|'free', isDonor: true, donorLevel: 'gold' }
 */

const prisma = require('./prisma')

/**
 * Donor level thresholds (cumulative cents).
 *   Bronze: $1+
 *   Silver: $25+
 *   Gold:   $100+
 */
const DONOR_THRESHOLDS = {
  gold: 10000, // $100
  silver: 2500, // $25
  bronze: 100, // $1
}

function donorLevel(totalCents) {
  if (totalCents >= DONOR_THRESHOLDS.gold) return 'gold'
  if (totalCents >= DONOR_THRESHOLDS.silver) return 'silver'
  if (totalCents >= DONOR_THRESHOLDS.bronze) return 'bronze'
  return null
}

/**
 * Enrich an array of user objects with badge data (plan, isDonor, donorLevel).
 * Returns a new array — does not mutate the input.
 *
 * @param {Array<{ id: number, [key: string]: any }>} users
 * @returns {Promise<Array>}
 */
async function enrichUsersWithBadges(users) {
  if (!users || users.length === 0) return []

  const userIds = users.map((u) => u.id).filter(Boolean)
  if (userIds.length === 0) return users

  // Fetch active subscriptions for these users
  let subMap = new Map()
  try {
    const subs = await prisma.subscription.findMany({
      where: {
        userId: { in: userIds },
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      select: { userId: true, plan: true },
    })
    subMap = new Map(subs.map((s) => [s.userId, s.plan]))
  } catch {
    // Subscription table may not exist — graceful degradation
  }

  // Fetch donation totals for these users
  let donorMap = new Map()
  try {
    const donations = await prisma.donation.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: 'completed',
      },
      _sum: { amount: true },
    })
    donorMap = new Map(donations.map((d) => [d.userId, d._sum.amount || 0]))
  } catch {
    // Donation table may not exist — graceful degradation
  }

  return users.map((user) => ({
    ...user,
    plan: subMap.get(user.id) || 'free',
    isDonor: (donorMap.get(user.id) || 0) > 0,
    donorLevel: donorLevel(donorMap.get(user.id) || 0),
  }))
}

/**
 * Enrich a single user object with badge data.
 */
async function enrichUserWithBadges(user) {
  if (!user || !user.id) return user
  const [enriched] = await enrichUsersWithBadges([user])
  return enriched || user
}

module.exports = {
  enrichUsersWithBadges,
  enrichUserWithBadges,
  donorLevel,
  DONOR_THRESHOLDS,
}
