/**
 * payments.constants.js — Subscription tiers, plan definitions, and Stripe config.
 */

const PLANS = {
  free: {
    name: 'Free',
    uploadsPerMonth: 10,
    aiMessagesPerDay: 30,
    storageMb: 500,
    prioritySupport: false,
    proBadge: false,
  },
  pro_monthly: {
    name: 'Pro (Monthly)',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO || '',
    uploadsPerMonth: -1, // unlimited
    aiMessagesPerDay: 120,
    storageMb: 5120,
    prioritySupport: true,
    proBadge: true,
  },
  pro_yearly: {
    name: 'Pro (Yearly)',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO_YEARLY || '',
    uploadsPerMonth: -1,
    aiMessagesPerDay: 120,
    storageMb: 5120,
    prioritySupport: true,
    proBadge: true,
  },
}

const DONATION_PRICE_ID = process.env.STRIPE_PRICE_ID_DONATION || ''

// Map Stripe price IDs back to our plan names
function planFromPriceId(priceId) {
  if (priceId === PLANS.pro_monthly.stripePriceId) return 'pro_monthly'
  if (priceId === PLANS.pro_yearly.stripePriceId) return 'pro_yearly'
  return 'free'
}

// Minimum and maximum donation amounts (in cents)
const DONATION_MIN_CENTS = 100 // $1.00
const DONATION_MAX_CENTS = 100000 // $1,000.00

// Max message length for donation messages
const DONATION_MESSAGE_MAX_LENGTH = 500

module.exports = {
  PLANS,
  DONATION_PRICE_ID,
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  DONATION_MESSAGE_MAX_LENGTH,
  planFromPriceId,
}
