/**
 * Reviews Routes — User testimonials / reviews for the platform.
 *
 * POST   /              — Submit or update a review (auth, rate limited 1/day)
 * GET    /mine          — Get the current user's review (auth)
 * GET    /public        — Random approved reviews for homepage (no auth)
 * GET    /admin         — Paginated admin review list (admin)
 * PATCH  /admin/:id     — Approve or reject a review (admin)
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const { reviewSubmitLimiter, reviewReadLimiter, reviewReportGenerateLimiter } = require('../../lib/rateLimiters')
const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')
const { clampLimit, clampPage } = require('../../lib/constants')
const { MAX_REVIEW_LENGTH, MIN_STARS, MAX_STARS } = require('./reviews.constants')
const { generateReviewReport, listReviewReports, getReviewReport } = require('./reviews.service')

const router = express.Router()

// ── POST / — Submit or update a review ──────────────────────────────────
router.post('/', requireAuth, reviewSubmitLimiter, async (req, res) => {
  try {
    const { stars, text } = req.body || {}

    // Validate stars
    const parsedStars = Number.parseInt(stars, 10)
    if (!Number.isInteger(parsedStars) || parsedStars < MIN_STARS || parsedStars > MAX_STARS) {
      return sendError(res, 400, `Stars must be an integer between ${MIN_STARS} and ${MAX_STARS}.`, ERROR_CODES.VALIDATION)
    }

    // Validate text
    if (typeof text !== 'string' || !text.trim()) {
      return sendError(res, 400, 'Review text is required.', ERROR_CODES.VALIDATION)
    }

    // Strip HTML tags and trim
    const cleanText = text.replace(/<[^>]*>/g, '').trim()

    if (!cleanText) {
      return sendError(res, 400, 'Review text is required.', ERROR_CODES.VALIDATION)
    }

    if (cleanText.length > MAX_REVIEW_LENGTH) {
      return sendError(
        res,
        400,
        `Review text must be ${MAX_REVIEW_LENGTH} characters or fewer.`,
        ERROR_CODES.VALIDATION,
      )
    }

    // Upsert: create or update the user's review
    const review = await prisma.userReview.upsert({
      where: { userId: req.user.userId },
      create: {
        userId: req.user.userId,
        stars: parsedStars,
        text: cleanText,
        status: 'pending',
      },
      update: {
        stars: parsedStars,
        text: cleanText,
        status: 'pending',
      },
    })

    res.status(200).json(review)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /mine — Current user's review ───────────────────────────────────
router.get('/mine', requireAuth, reviewReadLimiter, async (req, res) => {
  try {
    const review = await prisma.userReview.findUnique({
      where: { userId: req.user.userId },
    })

    res.json(review || null)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /public — Random approved reviews for homepage ──────────────────
router.get('/public', reviewReadLimiter, async (req, res) => {
  try {
    const rawLimit = Number.parseInt(req.query.limit, 10)
    const limit = !rawLimit || rawLimit < 1 ? 3 : Math.min(rawLimit, 10)

    // Use raw query for random selection — Prisma does not support ORDER BY RANDOM()
    const reviews = await prisma.$queryRaw`
      SELECT
        r.id,
        r.stars,
        r.text,
        r."createdAt",
        u.username,
        u."avatarUrl",
        u."accountType",
        (
          SELECT s.name
          FROM "Enrollment" e
          JOIN "Course" c ON c.id = e."courseId"
          JOIN "School" s ON s.id = c."schoolId"
          WHERE e."userId" = r."userId"
          LIMIT 1
        ) as "schoolName"
      FROM "UserReview" r
      JOIN "User" u ON u.id = r."userId"
      WHERE r.status = 'approved' AND r.stars >= 3
      ORDER BY RANDOM()
      LIMIT ${limit}
    `

    const mapped = reviews.map((r) => ({
      id: r.id,
      stars: r.stars,
      text: r.text,
      createdAt: r.createdAt,
      username: r.username,
      avatarUrl: r.avatarUrl,
      accountType: r.accountType,
      schoolName: r.schoolName || null,
    }))

    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json({ reviews: mapped })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /admin — Paginated admin review list ────────────────────────────
router.get('/admin', requireAuth, requireAdmin, reviewReadLimiter, async (req, res) => {
  try {
    const page = clampPage(req.query.page)
    const limit = clampLimit(req.query.limit)
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined

    const where = status ? { status } : {}

    const [reviews, total] = await Promise.all([
      prisma.userReview.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true, accountType: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userReview.count({ where }),
    ])

    res.json({
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /admin/:id — Approve or reject a review ──────────────────────
router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(reviewId)) {
      return sendError(res, 400, 'Invalid review id.', ERROR_CODES.BAD_REQUEST)
    }

    const { status } = req.body || {}
    if (!status || !['approved', 'rejected'].includes(status)) {
      return sendError(res, 400, 'Status must be "approved" or "rejected".', ERROR_CODES.VALIDATION)
    }

    const existing = await prisma.userReview.findUnique({ where: { id: reviewId } })
    if (!existing) {
      return sendError(res, 404, 'Review not found.', ERROR_CODES.NOT_FOUND)
    }

    const updated = await prisma.userReview.update({
      where: { id: reviewId },
      data: { status },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    })

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /admin/reports/generate — Trigger AI review report generation ────
router.post('/admin/reports/generate', requireAuth, requireAdmin, reviewReportGenerateLimiter, async (req, res) => {
  try {
    const days = Number.parseInt(req.body?.days, 10) || 7

    const report = await generateReviewReport({
      days: Math.min(Math.max(days, 1), 90),
      adminUserId: req.user.userId,
    })

    res.status(201).json(report)
  } catch (err) {
    if (err.message === 'No reviews found in the specified period.') {
      return sendError(res, 400, err.message, ERROR_CODES.BAD_REQUEST)
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to generate review report.' })
  }
})

// ── GET /admin/reports — List all review reports ──────────────────────────
router.get('/admin/reports', requireAuth, requireAdmin, reviewReadLimiter, async (req, res) => {
  try {
    const page = clampPage(req.query.page)
    const limit = clampLimit(req.query.limit)

    const result = await listReviewReports({ limit, page })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /admin/reports/:id — Get a single review report ───────────────────
router.get('/admin/reports/:id', requireAuth, requireAdmin, reviewReadLimiter, async (req, res) => {
  try {
    const reportId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(reportId)) {
      return sendError(res, 400, 'Invalid report id.', ERROR_CODES.BAD_REQUEST)
    }

    const report = await getReviewReport(reportId)
    if (!report) {
      return sendError(res, 404, 'Report not found.', ERROR_CODES.NOT_FOUND)
    }

    res.json(report)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
