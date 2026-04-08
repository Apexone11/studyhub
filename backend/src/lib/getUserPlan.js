/**
 * getUserPlan.js -- Resolve the active subscription plan for a user.
 * Returns 'free', 'pro_monthly', or 'pro_yearly'.
 * Wrapped in try-catch for graceful degradation if Subscription table is not yet migrated.
 */
const prisma = require('./prisma')

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due']

async function getUserPlan(userId) {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    })
    if (sub && ACTIVE_STATUSES.includes(sub.status)) {
      return sub.plan || 'free'
    }
  } catch {
    // Subscription table may not exist yet -- graceful degradation
  }
  return 'free'
}

function isPro(plan) {
  return plan === 'pro_monthly' || plan === 'pro_yearly'
}

/**
 * Check if a user is a donor (has any completed donation).
 * Returns { isDonor, donorLevel, totalCents }.
 */
async function getDonorStatus(userId) {
  try {
    const result = await prisma.donation.aggregate({
      where: { userId, status: 'completed' },
      _sum: { amount: true },
    })
    const totalCents = result._sum.amount || 0
    if (totalCents >= 10000) return { isDonor: true, donorLevel: 'gold', totalCents }
    if (totalCents >= 2500) return { isDonor: true, donorLevel: 'silver', totalCents }
    if (totalCents >= 100) return { isDonor: true, donorLevel: 'bronze', totalCents }
    return { isDonor: false, donorLevel: null, totalCents }
  } catch {
    return { isDonor: false, donorLevel: null, totalCents: 0 }
  }
}

/**
 * Get the effective tier for a user: 'pro_monthly', 'pro_yearly', 'donor', or 'free'.
 * Pro takes priority over donor.
 */
async function getUserTier(userId) {
  const plan = await getUserPlan(userId)
  if (isPro(plan)) return plan
  const { isDonor } = await getDonorStatus(userId)
  if (isDonor) return 'donor'
  return 'free'
}

module.exports = { getUserPlan, isPro, getDonorStatus, getUserTier }
