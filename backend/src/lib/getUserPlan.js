/**
 * getUserPlan.js -- Resolve the active subscription plan for a user.
 * Returns 'free', 'pro_monthly', or 'pro_yearly'.
 * Wrapped in try-catch for graceful degradation if Subscription table is not yet migrated.
 */
const prisma = require('./prisma')

async function getUserPlan(userId) {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    })
    if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
      return sub.plan || 'free'
    }
  } catch (_err) {
    // Subscription table may not exist yet -- graceful degradation
  }
  return 'free'
}

function isPro(plan) {
  return plan === 'pro_monthly' || plan === 'pro_yearly'
}

module.exports = { getUserPlan, isPro }
