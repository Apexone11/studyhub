/**
 * exams.routes.js — Upcoming Exams endpoints (Phase 2 of v2 design refresh).
 *
 * Mounted at /api/exams in index.js. Gated behind the
 * `design_v2_upcoming_exams` flag at the frontend layer; endpoints
 * themselves are always available to authenticated users (server flag
 * checks are applied inside route handlers where needed).
 *
 * Endpoints:
 *   GET    /upcoming?limit=3   — current user's next N exams
 *   GET    /?courseId=X        — current user's exams for a course
 *   POST   /                   — create an exam (owner-enrolled course only)
 *   PATCH  /:id                — update (owner only)
 *   DELETE /:id                — delete (owner only, hard delete)
 *
 * See docs/internal/design-refresh-v2-master-plan.md §5.
 */
const express = require('express')
const { z } = require('zod')
const prisma = require('../../lib/prisma')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { validate } = require('../../lib/validate')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { examReadLimiter, examWriteLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

const requireTrustedOrigin = originAllowlist()

// ── Date bounds ───────────────────────────────────────────────────────────
// Reject exam dates >5 years in the future or <1 year in the past.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
const FIVE_YEARS_MS = 5 * ONE_YEAR_MS

function isExamDateValid(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false
  const now = Date.now()
  const delta = date.getTime() - now
  return delta > -ONE_YEAR_MS && delta < FIVE_YEARS_MS
}

// ── Serializer ────────────────────────────────────────────────────────────
function serializeExam(exam) {
  if (!exam) return null
  return {
    id: exam.id,
    title: exam.title,
    location: exam.location,
    examDate: exam.examDate.toISOString(),
    visibility: exam.visibility,
    notes: exam.notes,
    // 0-100. DB-side CHECK constraint guarantees the range; we still
    // coalesce to 0 to survive a legacy row that somehow slipped
    // through without the default.
    preparednessPercent:
      typeof exam.preparednessPercent === 'number' ? exam.preparednessPercent : 0,
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
    course: exam.course
      ? { id: exam.course.id, code: exam.course.code, name: exam.course.name }
      : null,
  }
}

// ── Zod schemas ───────────────────────────────────────────────────────────
const upcomingQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(20).default(3),
  }),
})

const listQuerySchema = z.object({
  query: z.object({
    courseId: z.coerce.number().int().positive().optional(),
  }),
})

const createBodySchema = z.object({
  body: z.object({
    courseId: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().max(120).nullable().optional(),
    examDate: z.string().datetime(),
    notes: z.string().trim().max(500).nullable().optional(),
    // Preparedness is optional on create — defaults to 0. Integer
    // range pinned to the DB CHECK constraint; out-of-range values
    // rejected at zod time with a 400 before Prisma sees them.
    preparednessPercent: z.number().int().min(0).max(100).optional(),
  }),
})

const patchBodySchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().max(120).nullable().optional(),
    examDate: z.string().datetime().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    preparednessPercent: z.number().int().min(0).max(100).optional(),
  }),
})

const idParamSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
})

// ── All routes require auth ───────────────────────────────────────────────
router.use(requireAuth)

// ── GET /upcoming ─────────────────────────────────────────────────────────
router.get('/upcoming', examReadLimiter, validate(upcomingQuerySchema), async (req, res) => {
  try {
    const { limit } = req.query
    const exams = await prisma.courseExam.findMany({
      where: {
        userId: req.user.userId,
        examDate: { gt: new Date() },
      },
      orderBy: { examDate: 'asc' },
      take: limit,
      include: {
        course: { select: { id: true, code: true, name: true } },
      },
    })
    res.json({ exams: exams.map(serializeExam) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Failed to load upcoming exams.', ERROR_CODES.INTERNAL)
  }
})

// ── GET / ─────────────────────────────────────────────────────────────────
router.get('/', examReadLimiter, validate(listQuerySchema), async (req, res) => {
  try {
    const { courseId } = req.query
    const where = { userId: req.user.userId }
    if (courseId) where.courseId = courseId
    const exams = await prisma.courseExam.findMany({
      where,
      orderBy: { examDate: 'asc' },
      include: {
        course: { select: { id: true, code: true, name: true } },
      },
    })
    res.json({ exams: exams.map(serializeExam) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Failed to load exams.', ERROR_CODES.INTERNAL)
  }
})

// ── POST / ────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireTrustedOrigin,
  examWriteLimiter,
  validate(createBodySchema),
  async (req, res) => {
    try {
      const { courseId, title, location, examDate, notes, preparednessPercent } = req.body
      const parsedDate = new Date(examDate)
      if (!isExamDateValid(parsedDate)) {
        return sendError(
          res,
          400,
          'Exam date must be within the last year and the next five years.',
          ERROR_CODES.VALIDATION,
        )
      }

      // Enrollment check — user can only add exams for courses they are enrolled in.
      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: req.user.userId, courseId } },
        select: { id: true },
      })
      if (!enrollment) {
        return sendError(
          res,
          403,
          'You must be enrolled in the course to add an exam for it.',
          ERROR_CODES.FORBIDDEN,
        )
      }

      const exam = await prisma.courseExam.create({
        data: {
          userId: req.user.userId,
          courseId,
          title,
          location: location || null,
          examDate: parsedDate,
          notes: notes || null,
          // Omit when not supplied so Prisma uses the column default
          // (0). Zod already pinned the 0-100 range; the DB CHECK
          // constraint is defense in depth.
          ...(typeof preparednessPercent === 'number' ? { preparednessPercent } : {}),
        },
        include: {
          course: { select: { id: true, code: true, name: true } },
        },
      })
      res.status(201).json({ exam: serializeExam(exam) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Failed to create exam.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── PATCH /:id ────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireTrustedOrigin,
  examWriteLimiter,
  validate(patchBodySchema),
  async (req, res) => {
    try {
      const { id } = req.params
      const { title, location, examDate, notes, preparednessPercent } = req.body

      const existing = await prisma.courseExam.findUnique({
        where: { id },
        select: { id: true, userId: true },
      })
      if (!existing) {
        return sendError(res, 404, 'Exam not found.', ERROR_CODES.NOT_FOUND)
      }
      if (existing.userId !== req.user.userId) {
        return sendError(res, 403, 'You do not own this exam.', ERROR_CODES.FORBIDDEN)
      }

      const data = {}
      if (typeof title === 'string') data.title = title
      if (location !== undefined) data.location = location || null
      if (notes !== undefined) data.notes = notes || null
      if (typeof preparednessPercent === 'number') data.preparednessPercent = preparednessPercent
      if (typeof examDate === 'string') {
        const parsedDate = new Date(examDate)
        if (!isExamDateValid(parsedDate)) {
          return sendError(
            res,
            400,
            'Exam date must be within the last year and the next five years.',
            ERROR_CODES.VALIDATION,
          )
        }
        data.examDate = parsedDate
      }

      const updated = await prisma.courseExam.update({
        where: { id },
        data,
        include: {
          course: { select: { id: true, code: true, name: true } },
        },
      })
      res.json({ exam: serializeExam(updated) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Failed to update exam.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── DELETE /:id ───────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireTrustedOrigin,
  examWriteLimiter,
  validate(idParamSchema),
  async (req, res) => {
    try {
      const { id } = req.params
      const existing = await prisma.courseExam.findUnique({
        where: { id },
        select: { id: true, userId: true },
      })
      if (!existing) {
        return sendError(res, 404, 'Exam not found.', ERROR_CODES.NOT_FOUND)
      }
      if (existing.userId !== req.user.userId) {
        return sendError(res, 403, 'You do not own this exam.', ERROR_CODES.FORBIDDEN)
      }
      await prisma.courseExam.delete({ where: { id } })
      res.status(204).end()
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Failed to delete exam.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
