/**
 * payments.constants.js — Subscription tiers, plan definitions, and Stripe config.
 */

const PLANS = {
  free: {
    name: 'Free',
    uploadsPerMonth: 10,
    // Documents the per-tier ceiling that ai.constants.js DAILY_LIMITS
    // actually enforces. Free unverified students get 30/day; flipping
    // to 60/day is a perk for verifying their email (see ai.service.js
    // resolveDailyLimit — `verified` branch). The pricing page calls
    // this out explicitly so the verification perk is visible without
    // surprising readers who notice they're getting more than the
    // advertised "10/day" claim ever was.
    aiMessagesPerDay: 30,
    aiMessagesPerDayVerified: 60,
    privateGroups: 2,
    libraryBookmarks: 50,
    playgroundProjects: 3,
    videoMinutes: 30,
    videoSizeMb: 500,
    storageMb: 500,
    customThemes: false,
    prioritySupport: false,
    proBadge: false,
  },
  donor: {
    name: 'Supporter',
    uploadsPerMonth: 15,
    aiMessagesPerDay: 60,
    privateGroups: 4,
    libraryBookmarks: 100,
    playgroundProjects: 5,
    videoMinutes: 45,
    videoSizeMb: 1024,
    storageMb: 1024,
    customThemes: false,
    prioritySupport: false,
    proBadge: false,
    donorBadge: true,
  },
  pro_monthly: {
    name: 'Pro (Monthly)',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO || '',
    uploadsPerMonth: -1, // unlimited
    aiMessagesPerDay: 120,
    privateGroups: 10,
    libraryBookmarks: -1, // unlimited
    playgroundProjects: 25,
    videoMinutes: 60,
    videoSizeMb: 1536,
    storageMb: 5120,
    customThemes: true,
    prioritySupport: true,
    proBadge: true,
  },
  pro_yearly: {
    name: 'Pro (Yearly)',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO_YEARLY || '',
    uploadsPerMonth: -1,
    aiMessagesPerDay: 120,
    privateGroups: 10,
    libraryBookmarks: -1,
    playgroundProjects: 25,
    videoMinutes: 60,
    videoSizeMb: 1536,
    storageMb: 5120,
    customThemes: true,
    prioritySupport: true,
    proBadge: true,
  },
}

const DONATION_PRICE_ID = process.env.STRIPE_PRICE_ID_DONATION || ''

// Map Stripe price IDs back to our plan names.
// Reads env vars at call time (not module load) to handle late-bound config.
// Returns null for unknown price IDs so callers can preserve existing plan data.
function planFromPriceId(priceId) {
  if (!priceId) return null
  const monthlyId = process.env.STRIPE_PRICE_ID_PRO
  const yearlyId = process.env.STRIPE_PRICE_ID_PRO_YEARLY
  if (monthlyId && priceId === monthlyId) return 'pro_monthly'
  if (yearlyId && priceId === yearlyId) return 'pro_yearly'
  return null
}

// Minimum and maximum donation amounts (in cents)
const DONATION_MIN_CENTS = 100 // $1.00
const DONATION_MAX_CENTS = 100000 // $1,000.00

// Max message length for donation messages
const DONATION_MESSAGE_MAX_LENGTH = 500

// Defense in depth (security review 2026-05-03): freeze the plan table so
// no caller can mutate live limits at runtime, and expose an explicit
// allowlist for `PLANS[userPlan]` lookups. Bracket access is currently
// safe because `getUserPlan()` only returns canonical strings, but a
// future regression would otherwise let an attacker reach prototype keys
// like `__proto__` or `toString`.
Object.freeze(PLANS)
for (const key of Object.keys(PLANS)) Object.freeze(PLANS[key])

const KNOWN_PLANS = new Set(Object.keys(PLANS))

function getPlanConfig(planName) {
  return KNOWN_PLANS.has(planName) ? PLANS[planName] : PLANS.free
}

module.exports = {
  PLANS,
  KNOWN_PLANS,
  getPlanConfig,
  DONATION_PRICE_ID,
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  DONATION_MESSAGE_MAX_LENGTH,
  planFromPriceId,
}
