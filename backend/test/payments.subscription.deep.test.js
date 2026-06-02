/**
 * payments.subscription.deep.test.js — deep coverage for getUserPlan + isPro +
 * getDonorStatus + getUserTier + service.getUserSubscription.
 *
 * Pins:
 *   - free user → 'free'
 *   - active pro_monthly → 'pro_monthly'
 *   - active pro_yearly → 'pro_yearly'
 *   - trialing → returns the underlying plan (Pro)
 *   - past_due → 'free' (cutoff, per getUserPlan 2026-05-03 change)
 *   - canceled / incomplete_expired → 'free'
 *   - gift sub with expired currentPeriodEnd → 'free' (no Stripe webhook fires)
 *   - referral pro reward expiry honored
 *   - donor levels (bronze / silver / gold) at thresholds
 *   - free + donor → returns 'donor' plan limits
 *   - Subscription table missing (P2021) → graceful 'free' fallback
 *   - getUserTier prioritizes Pro over donor
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const getUserPlanPath = require.resolve('../src/lib/getUserPlan')
const servicePath = require.resolve('../src/modules/payments/payments.service')

const mocks = vi.hoisted(() => {
  const prisma = {
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    donation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  }

  const stripeCustomer = { create: vi.fn() }
  const stripeCheckout = { create: vi.fn() }
  const stripeBillingPortal = { sessions: { create: vi.fn() } }
  const stripeSubscriptions = { retrieve: vi.fn() }
  const stripeWebhooks = { constructEvent: vi.fn() }
  const stripeInvoices = { retrieve: vi.fn() }

  function StripeClass() {
    this.customers = stripeCustomer
    this.checkout = { sessions: stripeCheckout }
    this.billingPortal = stripeBillingPortal
    this.subscriptions = stripeSubscriptions
    this.webhooks = stripeWebhooks
    this.invoices = stripeInvoices
  }

  return {
    prisma,
    StripeClass,
    email: {
      sendSubscriptionWelcome: vi.fn().mockResolvedValue({}),
      sendDonationThankYou: vi.fn().mockResolvedValue({}),
      sendPaymentReceipt: vi.fn().mockResolvedValue({}),
    },
    notify: { createNotification: vi.fn().mockResolvedValue({}) },
    sentry: { captureError: vi.fn() },
    achievements: {
      emitAchievementEvent: vi.fn(),
      EVENT_KINDS: {
        DONATION_COMPLETE: 'donation.complete',
        SUBSCRIPTION_ACTIVATE: 'subscription.activate',
      },
    },
  }
})

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/email/email'), mocks.email],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/logger'), mockLogger],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
])

const originalModuleLoad = Module._load
let getUserPlan, isPro, getDonorStatus, getUserTier
let service

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_subdeep'
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_deep'
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_deep'

  Module._load = function patched(requestId, parent, isMain) {
    if (requestId === 'stripe') return mocks.StripeClass
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const m = mockTargets.get(resolved)
      if (m) return m
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[getUserPlanPath]
  delete require.cache[servicePath]
  ;({ getUserPlan, isPro, getDonorStatus, getUserTier } = require(getUserPlanPath))
  service = require(servicePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[getUserPlanPath]
  delete require.cache[servicePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.user.findUnique.mockResolvedValue(null) // default: no referral reward
  mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
})

// ────────────────────────────────────────────────────────────────────────────
// getUserPlan
// ────────────────────────────────────────────────────────────────────────────
describe('getUserPlan()', () => {
  it('returns "free" when no Subscription row exists', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    const plan = await getUserPlan(42)
    expect(plan).toBe('free')
  })

  it('returns "pro_monthly" for an active pro_monthly subscription', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
    })
    expect(await getUserPlan(42)).toBe('pro_monthly')
  })

  it('returns "pro_yearly" for an active pro_yearly subscription', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_yearly',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 300 * 86400_000),
    })
    expect(await getUserPlan(42)).toBe('pro_yearly')
  })

  it('returns the plan for "trialing" status (treated as active)', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
    })
    expect(await getUserPlan(42)).toBe('pro_monthly')
  })

  it('returns "free" for past_due (no grace period, 2026-05-03 cutoff)', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'past_due',
      currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
    })
    expect(await getUserPlan(42)).toBe('free')
  })

  it('returns "free" for canceled subscription', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'canceled',
      currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
    })
    expect(await getUserPlan(42)).toBe('free')
  })

  it('returns "free" when gift subscription has expired (currentPeriodEnd in the past)', async () => {
    // Gift subs set status='active' but rely on currentPeriodEnd as the
    // hard expiry — no Stripe webhook flips them to canceled. Without this
    // guard a 30-day gift would confer Pro forever.
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - 86400_000), // yesterday
    })
    expect(await getUserPlan(42)).toBe('free')
  })

  it('returns "pro_monthly" when user has an unexpired proRewardExpiresAt and no sub', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      proRewardExpiresAt: new Date(Date.now() + 5 * 86400_000),
    })
    expect(await getUserPlan(42)).toBe('pro_monthly')
  })

  it('returns "free" when proRewardExpiresAt is in the past', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      proRewardExpiresAt: new Date(Date.now() - 86400_000),
    })
    expect(await getUserPlan(42)).toBe('free')
  })

  it('gracefully returns "free" when Subscription table query throws (table missing)', async () => {
    const err = new Error('relation "Subscription" does not exist')
    err.code = 'P2021'
    mocks.prisma.subscription.findUnique.mockRejectedValue(err)
    mocks.prisma.user.findUnique.mockRejectedValue(err)
    expect(await getUserPlan(42)).toBe('free')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// isPro
// ────────────────────────────────────────────────────────────────────────────
describe('isPro()', () => {
  it('is true for pro_monthly and pro_yearly', () => {
    expect(isPro('pro_monthly')).toBe(true)
    expect(isPro('pro_yearly')).toBe(true)
  })
  it('is false for free / donor / unknown values', () => {
    expect(isPro('free')).toBe(false)
    expect(isPro('donor')).toBe(false)
    expect(isPro(null)).toBe(false)
    expect(isPro(undefined)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getDonorStatus
// ────────────────────────────────────────────────────────────────────────────
describe('getDonorStatus()', () => {
  it('returns gold for total ≥ $100', async () => {
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 12000 } })
    const status = await getDonorStatus(42)
    expect(status).toEqual({ isDonor: true, donorLevel: 'gold', totalCents: 12000 })
  })

  it('returns silver for total ≥ $25', async () => {
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 2500 } })
    expect((await getDonorStatus(42)).donorLevel).toBe('silver')
  })

  it('returns bronze for total ≥ $1', async () => {
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 100 } })
    expect((await getDonorStatus(42)).donorLevel).toBe('bronze')
  })

  it('returns isDonor=false when total is below $1', async () => {
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 50 } })
    const status = await getDonorStatus(42)
    expect(status.isDonor).toBe(false)
    expect(status.donorLevel).toBeNull()
  })

  it('gracefully returns 0 when Donation table query throws', async () => {
    mocks.prisma.donation.aggregate.mockRejectedValue(new Error('table missing'))
    const status = await getDonorStatus(42)
    expect(status.isDonor).toBe(false)
    expect(status.totalCents).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getUserTier
// ────────────────────────────────────────────────────────────────────────────
describe('getUserTier()', () => {
  it('returns the Pro plan when user is on Pro AND a donor', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
    })
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 15000 } })
    expect(await getUserTier(42)).toBe('pro_monthly')
  })

  it('returns "donor" when user is free + donor', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 5000 } })
    expect(await getUserTier(42)).toBe('donor')
  })

  it('returns "free" when neither pro nor donor', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    expect(await getUserTier(42)).toBe('free')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// service.getUserSubscription — composite view returned to the client
// ────────────────────────────────────────────────────────────────────────────
describe('service.getUserSubscription()', () => {
  it('returns free plan + donor info when user is canceled but has bronze donations', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'canceled',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
      createdAt: new Date(),
    })
    mocks.prisma.donation.aggregate.mockResolvedValue({ _sum: { amount: 500 } })
    const result = await service.getUserSubscription(42)
    expect(result.plan).toBe('donor')
    expect(result.isDonor).toBe(true)
    expect(result.donorLevel).toBe('bronze')
  })

  it('returns the active pro plan with feature limits attached', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: new Date(),
    })
    const result = await service.getUserSubscription(42)
    expect(result.plan).toBe('pro_monthly')
    expect(result.status).toBe('active')
    expect(result.features).toBeDefined()
    expect(result.features.aiMessagesPerDay).toBe(120) // Pro tier limit
    expect(result.features.proBadge).toBe(true)
  })

  it('returns incomplete status + free features when sub is incomplete', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro_monthly',
      status: 'incomplete',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: new Date(),
    })
    const result = await service.getUserSubscription(42)
    expect(result.plan).toBe('free')
    expect(result.status).toBe('incomplete')
    expect(result.features.aiMessagesPerDay).toBe(30) // Free tier
  })
})
