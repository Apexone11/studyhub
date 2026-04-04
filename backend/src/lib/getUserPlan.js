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

module.exports = { getUserPlan, isPro }
