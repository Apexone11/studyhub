/**
 * sprintE.routes.js — Sprint E pro-level payment features.
 *
 * Routes (all under /api/payments):
 *   POST /referral/create          — Create a referral code (Pro users)
 *   GET  /referral/mine            — Get current user's referral codes
 *   POST /referral/redeem          — Redeem a referral code
 *   POST /gift/checkout            — Purchase a gift subscription
 *   POST /gift/redeem              — Redeem a gift subscription code
 *   GET  /gift/mine                — Get gifts sent by current user
 *   POST /subscription/pause       — Pause subscription (up to 30 days)
 *   POST /subscription/resume      — Resume a paused subscription
 *   GET  /subscription/pause-status — Check current pause status
 *   POST /checkout/trial           — Start a 7-day free trial
 *   POST /checkout/student-discount — Verify student status for discount
 */

const express = require('express')
const crypto = require('crypto')
const prisma = require('../../lib/prisma')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const log = require('../../lib/logger')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { PLANS } = require('./payments.constants')
const service = require('./payments.service')
const { paymentCheckoutLimiter, paymentReadLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

// ── Helper: generate short codes ────────────────────────────────────────

function generateCode(prefix, length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let code = ''
  const bytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return `${prefix}-${code}`
}

function getReferralInactiveReason(referral, now = new Date()) {
  if (!referral.active) return 'deactivated'
  if (referral.expiresAt && referral.expiresAt < now) return 'expired'
  if (referral.maxUses > 0 && referral.currentUses >= referral.maxUses) return 'maxed_out'
  return null
}

// ── REFERRAL CODES ──────────────────────────────────────────────────────

// POST /referral/create — Create a referral code (any authenticated user)
router.post('/referral/create', requireAuth, paymentCheckoutLimiter, async (req, res) => {
  try {
    const userId = req.user.userId
    const now = new Date()

    const existingCodes = await prisma.referralCode.findMany({
      where: { ownerId: userId, active: true },
      select: { id: true, active: true, expiresAt: true, maxUses: true, currentUses: true },
    })

    const staleCodeIds = existingCodes
      .filter((code) => getReferralInactiveReason(code, now))
      .map((code) => code.id)

    if (staleCodeIds.length > 0) {
      await prisma.referralCode.updateMany({
        where: { id: { in: staleCodeIds } },
        data: { active: false },
      })
    }

    const activeCount = existingCodes.length - staleCodeIds.length
    if (activeCount >= 5) {
      return sendError(
        res,
        400,
        'You can have at most 5 active referral codes.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const code = generateCode('SH')

    const referral = await prisma.referralCode.create({
      data: {
        code,
        ownerId: userId,
        rewardType: 'trial_extension',
        rewardValue: 7, // 7 extra days of trial
        maxUses: 0, // unlimited
      },
    })

    res.status(201).json({
      id: referral.id,
      code: referral.code,
      rewardType: referral.rewardType,
      rewardValue: referral.rewardValue,
      currentUses: 0,
      active: true,
      isRedeemable: true,
      inactiveReason: null,
      createdAt: referral.createdAt,
    })
  } catch (error) {
    captureError(error, { context: 'referral.create' })
    log.error({ err: error }, 'Failed to create referral code')
    sendError(res, 500, 'Failed to create referral code.', ERROR_CODES.INTERNAL)
  }
})

// GET /referral/mine — Get current user's referral codes with stats
router.get('/referral/mine', requireAuth, paymentReadLimiter, async (req, res) => {
  try {
    const now = new Date()
    const codes = await prisma.referralCode.findMany({
      where: { ownerId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { redemptions: true } },
      },
    })

    const normalizedCodes = codes.map((code) => {
      const currentUses = code._count.redemptions
      const inactiveReason = getReferralInactiveReason(
        {
          active: code.active,
          expiresAt: code.expiresAt,
          maxUses: code.maxUses,
          currentUses,
        },
        now,
      )

      return {
        id: code.id,
        code: code.code,
        rewardType: code.rewardType,
        rewardValue: code.rewardValue,
        maxUses: code.maxUses,
        currentUses,
        active: !inactiveReason,
        isRedeemable: !inactiveReason,
        inactiveReason,
        expiresAt: code.expiresAt,
        createdAt: code.createdAt,
      }
    })

    const staleCodeIds = normalizedCodes
      .filter((code) => code.inactiveReason && code.inactiveReason !== 'deactivated')
      .map((code) => code.id)

    if (staleCodeIds.length > 0) {
      await prisma.referralCode.updateMany({
        where: { id: { in: staleCodeIds }, active: true },
        data: { active: false },
      })
    }

    res.json({
      codes: normalizedCodes,
    })
  } catch (error) {
    captureError(error, { context: 'referral.mine' })
    sendError(res, 500, 'Failed to fetch referral codes.', ERROR_CODES.INTERNAL)
  }
})

// POST /referral/redeem — Redeem a referral code
router.post('/referral/redeem', requireAuth, paymentCheckoutLimiter, async (req, res) => {
  try {
    const { code } = req.body
    const userId = req.user.userId

    if (!code || typeof code !== 'string') {
      return sendError(res, 400, 'Referral code is required.', ERROR_CODES.VALIDATION)
    }

    const referral = await prisma.referralCode.findUnique({
      where: { code: code.trim().toUpperCase() },
    })

    if (!referral || !referral.active) {
      return sendError(res, 404, 'Invalid or expired referral code.', ERROR_CODES.NOT_FOUND)
    }

    if (referral.ownerId === userId) {
      return sendError(
        res,
        400,
        'You cannot redeem your own referral code.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    if (referral.expiresAt && referral.expiresAt < new Date()) {
      await prisma.referralCode
        .update({
          where: { id: referral.id },
          data: { active: false },
        })
        .catch(() => {})
      return sendError(res, 400, 'This referral code has expired.', ERROR_CODES.BAD_REQUEST)
    }

    if (referral.maxUses > 0 && referral.currentUses >= referral.maxUses) {
      await prisma.referralCode
        .update({
          where: { id: referral.id },
          data: { active: false },
        })
        .catch(() => {})
      return sendError(
        res,
        400,
        'This referral code has reached its maximum uses.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    // Check if already redeemed
    const existing = await prisma.referralRedemption.findUnique({
      where: {
        referralCodeId_redeemedById: {
          referralCodeId: referral.id,
          redeemedById: userId,
        },
      },
    })
    if (existing) {
      return sendError(res, 400, 'You have already redeemed this code.', ERROR_CODES.CONFLICT)
    }

    // Create redemption
    await prisma.$transaction([
      prisma.referralRedemption.create({
        data: {
          referralCodeId: referral.id,
          redeemedById: userId,
        },
      }),
      prisma.referralCode.update({
        where: { id: referral.id },
        data: { currentUses: { increment: 1 } },
      }),
    ])

    log.info(
      { userId, code: referral.code, rewardType: referral.rewardType },
      'Referral code redeemed',
    )

    res.json({
      message: `Referral code redeemed! You earned ${referral.rewardValue} ${referral.rewardType === 'trial_extension' ? 'extra trial days' : referral.rewardType === 'discount_percent' ? '% discount' : ' cents credit'}.`,
      rewardType: referral.rewardType,
      rewardValue: referral.rewardValue,
    })
  } catch (error) {
    captureError(error, { context: 'referral.redeem' })
    log.error({ err: error }, 'Failed to redeem referral code')
    sendError(res, 500, 'Failed to redeem referral code.', ERROR_CODES.INTERNAL)
  }
})

// DELETE /referral/:id — Deactivate a referral code
router.delete('/referral/:id', requireAuth, async (req, res) => {
  try {
    const codeId = parseInt(req.params.id, 10)
    if (!codeId || isNaN(codeId)) {
      return sendError(res, 400, 'Invalid code ID.', ERROR_CODES.VALIDATION)
    }

    const code = await prisma.referralCode.findFirst({
      where: { id: codeId, ownerId: req.user.userId },
    })
    if (!code) {
      return sendError(res, 404, 'Referral code not found.', ERROR_CODES.NOT_FOUND)
    }

    await prisma.referralCode.update({
      where: { id: codeId },
      data: { active: false },
    })

    res.json({ message: 'Referral code deactivated.' })
  } catch (error) {
    captureError(error, { context: 'referral.delete' })
    sendError(res, 500, 'Failed to deactivate referral code.', ERROR_CODES.INTERNAL)
  }
})

// ── GIFT SUBSCRIPTIONS ──────────────────────────────────────────────────

// POST /gift/checkout — Purchase a gift subscription
router.post('/gift/checkout', requireAuth, paymentCheckoutLimiter, async (req, res) => {
  try {
    const { recipientEmail, plan, durationMonths, message } = req.body
    const userId = req.user.userId

    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return sendError(res, 400, 'Recipient email is required.', ERROR_CODES.VALIDATION)
    }

    const normalizedEmail = recipientEmail.trim().toLowerCase()

    // Prevent gifting to yourself
    const gifterUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    })
    if (gifterUser?.email && gifterUser.email.toLowerCase() === normalizedEmail) {
      return sendError(
        res,
        400,
        'You cannot gift a subscription to yourself.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    // Limit gifts per day to prevent abuse (max 3 gifts per 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentGiftCount = await prisma.giftSubscription.count({
      where: { gifterId: userId, createdAt: { gte: oneDayAgo } },
    })
    if (recentGiftCount >= 3) {
      return sendError(res, 429, 'You can send at most 3 gifts per day.', ERROR_CODES.RATE_LIMITED)
    }

    const validPlans = ['pro_monthly', 'pro_yearly']
    const giftPlan = validPlans.includes(plan) ? plan : 'pro_monthly'
    const months = Math.min(12, Math.max(1, parseInt(durationMonths, 10) || 1))

    const planDef = PLANS[giftPlan]
    if (!planDef?.stripePriceId) {
      return sendError(res, 400, 'Gift plan is not configured.', ERROR_CODES.BAD_REQUEST)
    }

    const giftCode = generateCode('GIFT')
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    // Calculate amount: monthly price * duration months
    const stripe = service.getStripe()
    const price = await stripe.prices.retrieve(planDef.stripePriceId)
    const unitAmount = price.unit_amount || 499
    const totalAmount = unitAmount * months

    const session = await stripe.checkout.sessions.create({
      customer: await service.getOrCreateCustomer({
        id: userId,
        email: gifterUser?.email || '',
        username: gifterUser?.username || req.user.username,
      }),
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `StudyHub Pro Gift (${months} month${months > 1 ? 's' : ''})`,
              description: `Gift subscription for ${recipientEmail}`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/settings?tab=subscription&gift=success`,
      cancel_url: `${frontendUrl}/settings?tab=subscription&gift=canceled`,
      metadata: {
        type: 'gift',
        studyhub_user_id: String(userId),
        gift_code: giftCode,
        recipient_email: recipientEmail,
        plan: giftPlan,
        duration_months: String(months),
      },
    })

    // Create pending gift record
    await prisma.giftSubscription.create({
      data: {
        gifterId: userId,
        recipientEmail: recipientEmail.trim().toLowerCase(),
        plan: giftPlan,
        durationMonths: months,
        message: (message || '').slice(0, 500) || null,
        stripeSessionId: session.id,
        giftCode,
        status: 'pending',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days to redeem
      },
    })

    res.json({ url: session.url, sessionId: session.id, giftCode })
  } catch (error) {
    captureError(error, { context: 'gift.checkout' })
    log.error({ err: error }, 'Failed to create gift checkout')
    sendError(res, 500, 'Failed to create gift checkout.', ERROR_CODES.INTERNAL)
  }
})

// POST /gift/redeem — Redeem a gift subscription code
router.post('/gift/redeem', requireAuth, paymentCheckoutLimiter, async (req, res) => {
  try {
    const { code } = req.body
    const userId = req.user.userId

    if (!code || typeof code !== 'string') {
      return sendError(res, 400, 'Gift code is required.', ERROR_CODES.VALIDATION)
    }

    const gift = await prisma.giftSubscription.findUnique({
      where: { giftCode: code.trim().toUpperCase() },
    })

    if (!gift || gift.status !== 'paid') {
      return sendError(res, 404, 'Invalid or already redeemed gift code.', ERROR_CODES.NOT_FOUND)
    }

    // Prevent redeeming your own gift
    if (gift.gifterId === userId) {
      return sendError(
        res,
        400,
        'You cannot redeem a gift you purchased yourself.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    if (gift.expiresAt && gift.expiresAt < new Date()) {
      return sendError(res, 400, 'This gift code has expired.', ERROR_CODES.BAD_REQUEST)
    }

    // Activate subscription for the redeemer
    const now = new Date()
    const endDate = new Date(now.getTime() + gift.durationMonths * 30 * 24 * 60 * 60 * 1000)

    await prisma.$transaction([
      prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeCustomerId: 'gift_' + gift.giftCode,
          stripeSubscriptionId: 'gift_sub_' + gift.giftCode,
          stripePriceId: PLANS[gift.plan]?.stripePriceId || '',
          plan: gift.plan,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: endDate,
        },
        update: {
          plan: gift.plan,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: endDate,
          canceledAt: null,
        },
      }),
      prisma.giftSubscription.update({
        where: { id: gift.id },
        data: {
          recipientId: userId,
          status: 'redeemed',
          redeemedAt: now,
        },
      }),
    ])

    log.info({ userId, giftCode: gift.giftCode, plan: gift.plan }, 'Gift subscription redeemed')
    res.json({
      message: `Gift redeemed! You now have ${gift.plan === 'pro_yearly' ? 'Pro Yearly' : 'Pro Monthly'} for ${gift.durationMonths} month${gift.durationMonths > 1 ? 's' : ''}.`,
      plan: gift.plan,
      expiresAt: endDate,
    })
  } catch (error) {
    captureError(error, { context: 'gift.redeem' })
    log.error({ err: error }, 'Failed to redeem gift')
    sendError(res, 500, 'Failed to redeem gift subscription.', ERROR_CODES.INTERNAL)
  }
})

// GET /gift/mine — Get gifts sent by current user
router.get('/gift/mine', requireAuth, paymentReadLimiter, async (req, res) => {
  try {
    const gifts = await prisma.giftSubscription.findMany({
      where: { gifterId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        recipientEmail: true,
        plan: true,
        durationMonths: true,
        status: true,
        giftCode: true,
        expiresAt: true,
        redeemedAt: true,
        createdAt: true,
      },
    })

    res.json({ gifts })
  } catch (error) {
    captureError(error, { context: 'gift.mine' })
    sendError(res, 500, 'Failed to fetch gifts.', ERROR_CODES.INTERNAL)
  }
})

// ── SUBSCRIPTION PAUSE ──────────────────────────────────────────────────

// POST /subscription/pause — Pause subscription for up to 30 days
router.post('/subscription/pause', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId
    const { days, reason } = req.body

    const pauseDays = Math.min(30, Math.max(1, parseInt(days, 10) || 14))

    // Check user has an active subscription
    const sub = await prisma.subscription.findUnique({
      where: { userId },
    })
    if (!sub || sub.status !== 'active') {
      return sendError(res, 400, 'No active subscription to pause.', ERROR_CODES.BAD_REQUEST)
    }

    // Check for existing active pause
    const existingPause = await prisma.subscriptionPause.findFirst({
      where: { userId, status: 'active' },
    })
    if (existingPause) {
      return sendError(
        res,
        400,
        'You already have an active pause. Resume first before pausing again.',
        ERROR_CODES.CONFLICT,
      )
    }

    // Pause the Stripe subscription (if it's a real Stripe sub)
    if (sub.stripeSubscriptionId && !sub.stripeSubscriptionId.startsWith('gift_')) {
      try {
        const stripe = service.getStripe()
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          pause_collection: {
            behavior: 'void',
            resumes_at: Math.floor(Date.now() / 1000) + pauseDays * 86400,
          },
        })
      } catch (stripeErr) {
        log.warn(
          { err: stripeErr.message },
          'Failed to pause Stripe subscription (continuing with local pause)',
        )
      }
    }

    const resumeAt = new Date(Date.now() + pauseDays * 24 * 60 * 60 * 1000)

    const pause = await prisma.subscriptionPause.create({
      data: {
        userId,
        reason: (reason || '').slice(0, 500) || null,
        resumeAt,
        status: 'active',
      },
    })

    log.info({ userId, pauseDays, resumeAt }, 'Subscription paused')
    res.json({
      message: `Subscription paused for ${pauseDays} days. It will resume on ${resumeAt.toLocaleDateString()}.`,
      pause: {
        id: pause.id,
        pausedAt: pause.pausedAt,
        resumeAt: pause.resumeAt,
        status: pause.status,
      },
    })
  } catch (error) {
    captureError(error, { context: 'subscription.pause' })
    log.error({ err: error }, 'Failed to pause subscription')
    sendError(res, 500, 'Failed to pause subscription.', ERROR_CODES.INTERNAL)
  }
})

// POST /subscription/resume — Resume a paused subscription
router.post('/subscription/resume', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId

    const pause = await prisma.subscriptionPause.findFirst({
      where: { userId, status: 'active' },
    })
    if (!pause) {
      return sendError(res, 400, 'No active pause found.', ERROR_CODES.BAD_REQUEST)
    }

    // Resume Stripe subscription
    const sub = await prisma.subscription.findUnique({ where: { userId } })
    if (sub?.stripeSubscriptionId && !sub.stripeSubscriptionId.startsWith('gift_')) {
      try {
        const stripe = service.getStripe()
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          pause_collection: '',
        })
      } catch (stripeErr) {
        log.warn({ err: stripeErr.message }, 'Failed to resume Stripe subscription')
      }
    }

    await prisma.subscriptionPause.update({
      where: { id: pause.id },
      data: { status: 'resumed', resumedAt: new Date() },
    })

    log.info({ userId }, 'Subscription resumed')
    res.json({ message: 'Subscription resumed successfully.' })
  } catch (error) {
    captureError(error, { context: 'subscription.resume' })
    sendError(res, 500, 'Failed to resume subscription.', ERROR_CODES.INTERNAL)
  }
})

// GET /subscription/pause-status — Check current pause status
router.get('/subscription/pause-status', requireAuth, async (req, res) => {
  try {
    const pause = await prisma.subscriptionPause.findFirst({
      where: { userId: req.user.userId, status: 'active' },
      select: {
        id: true,
        pausedAt: true,
        resumeAt: true,
        reason: true,
        status: true,
      },
    })

    res.json({ paused: Boolean(pause), pause: pause || null })
  } catch (error) {
    captureError(error, { context: 'subscription.pauseStatus' })
    sendError(res, 500, 'Failed to check pause status.', ERROR_CODES.INTERNAL)
  }
})

// ── FREE TRIAL ──────────────────────────────────────────────────────────

// POST /checkout/trial — Start a 7-day free trial via Stripe
router.post('/checkout/trial', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId

    // Check if user already had a subscription (no repeat trials)
    const existingSub = await prisma.subscription.findUnique({
      where: { userId },
    })
    if (existingSub) {
      return sendError(
        res,
        400,
        'Free trial is only available for first-time subscribers.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    // Check if user redeemed a referral that extends trial
    let trialDays = 7
    try {
      const redemptions = await prisma.referralRedemption.findMany({
        where: { redeemedById: userId },
        include: { referralCode: { select: { rewardType: true, rewardValue: true } } },
      })
      for (const r of redemptions) {
        if (r.referralCode.rewardType === 'trial_extension') {
          trialDays += r.referralCode.rewardValue
        }
      }
    } catch {
      // Referral table may not exist
    }

    // Fetch email from DB (middleware auth doesn't include email)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    })
    if (!user?.email) {
      return sendError(
        res,
        400,
        'Could not find your email. Please update your profile.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const stripe = service.getStripe()
    const planDef = PLANS.pro_monthly
    if (!planDef?.stripePriceId) {
      return sendError(res, 500, 'Pro plan not configured.', ERROR_CODES.INTERNAL)
    }

    const customerId = await service.getOrCreateCustomer({
      id: userId,
      email: user.email,
      username: user.username || req.user.username,
    })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planDef.stripePriceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          studyhub_user_id: String(userId),
          plan: 'pro_monthly',
        },
      },
      success_url: `${frontendUrl}/settings?payment=success&trial=true`,
      cancel_url: `${frontendUrl}/pricing?payment=canceled`,
      metadata: {
        studyhub_user_id: String(userId),
        plan: 'pro_monthly',
        is_trial: 'true',
      },
    })

    res.json({ url: session.url, trialDays })
  } catch (error) {
    captureError(error, { context: 'checkout.trial' })
    log.error({ err: error }, 'Failed to create trial checkout')
    sendError(res, 500, 'Failed to start free trial.', ERROR_CODES.INTERNAL)
  }
})

// ── STUDENT DISCOUNT ────────────────────────────────────────────────────

// POST /checkout/student-discount — Apply .edu email discount (20% off)
router.post('/checkout/student-discount', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId
    const { plan } = req.body

    // Verify user has a .edu email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    })

    if (!user?.email || !user.emailVerified) {
      return sendError(
        res,
        400,
        'You must have a verified email to qualify for the student discount.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const isEdu =
      user.email.toLowerCase().endsWith('.edu') ||
      user.email.toLowerCase().endsWith('.edu.au') ||
      user.email.toLowerCase().endsWith('.ac.uk') ||
      user.email.toLowerCase().endsWith('.edu.cn')

    if (!isEdu) {
      return sendError(
        res,
        400,
        'Student discount requires a verified .edu email address.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const validPlans = ['pro_monthly', 'pro_yearly']
    const selectedPlan = validPlans.includes(plan) ? plan : 'pro_monthly'
    const planDef = PLANS[selectedPlan]
    if (!planDef?.stripePriceId) {
      return sendError(res, 500, 'Plan not configured.', ERROR_CODES.INTERNAL)
    }

    const stripe = service.getStripe()

    // Create a 20% off coupon (or find existing one)
    let coupon
    try {
      coupon = await stripe.coupons.retrieve('STUDENT20')
    } catch {
      coupon = await stripe.coupons.create({
        id: 'STUDENT20',
        percent_off: 20,
        duration: 'forever',
        name: 'Student Discount (20% off)',
      })
    }

    const customerId = await service.getOrCreateCustomer({
      id: userId,
      email: user.email,
      username: req.user.username,
    })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planDef.stripePriceId, quantity: 1 }],
      discounts: [{ coupon: coupon.id }],
      success_url: `${frontendUrl}/settings?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing?payment=canceled`,
      metadata: {
        studyhub_user_id: String(userId),
        plan: selectedPlan,
        student_discount: 'true',
      },
      subscription_data: {
        metadata: {
          studyhub_user_id: String(userId),
          plan: selectedPlan,
        },
      },
    })

    res.json({ url: session.url, discount: '20%' })
  } catch (error) {
    captureError(error, { context: 'checkout.studentDiscount' })
    log.error({ err: error }, 'Failed to create student discount checkout')
    sendError(res, 500, 'Failed to apply student discount.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
