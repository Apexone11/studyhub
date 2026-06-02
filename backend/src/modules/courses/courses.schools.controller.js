const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { cacheControl } = require('../../lib/cacheControl')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { distanceKm } = require('../../lib/geo/haversine')
const { schoolsLimiter, POPULAR_COURSES_LIMIT } = require('./courses.constants')
// Stricter per-USER cap (30/15min) layered on top of the existing
// per-IP cap (120/15min). Defends against authenticated scraper
// enumeration of the school + course taxonomy.
// Feature-expansion security addendum §1 HIGH requirement.
const { discoverySchoolsLimiter, discoveryCoursesLimiter } = require('../../lib/rateLimiters')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()

// Parse a lat or lng from a query string. Returns the number if it's
// inside the valid range, otherwise null. We never persist the coords —
// they're per-request only and used to sort the response.
function parseCoord(raw, kind) {
  if (raw == null || raw === '') return null
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return null
  if (kind === 'lat' && (parsed < -90 || parsed > 90)) return null
  if (kind === 'lng' && (parsed < -180 || parsed > 180)) return null
  return parsed
}

// Public endpoint for school + course dropdowns.
//
// IMPORTANT: must NOT use { public: true }. Cloudflare's CDN ignores
// Vary: Origin on non-Enterprise plans (only Vary: Accept-Encoding is
// honored), so a `public` Cache-Control here would let Cloudflare cache
// one origin's response and replay it to every other origin. The
// browser sees Access-Control-Allow-Origin from the WRONG origin and
// reports "CORS error" even though the backend is healthy. Browser
// cache (which DOES honor Vary: Origin and is not shared across users)
// gives us the same user-perceived speedup without the CORS poisoning.
router.get(
  '/schools',
  cacheControl(600, { staleWhileRevalidate: 1800 }),
  schoolsLimiter,
  discoverySchoolsLimiter,
  async (req, res) => {
    try {
      const schools = await prisma.school.findMany({
        select: {
          id: true,
          name: true,
          short: true,
          city: true,
          state: true,
          schoolType: true,
          logoUrl: true,
          courses: {
            select: {
              id: true,
              code: true,
              name: true,
              department: true,
            },
            orderBy: { code: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })

      return res.json(schools)
    } catch (error) {
      captureError(error, {
        route: req.originalUrl,
        method: req.method,
      })

      log.error(
        { event: 'courses.schools_list_failed', err: error?.message || String(error) },
        'Failed to load schools list',
      )
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

// Public endpoint for popular courses ranked by published sheet count.
// Same Cloudflare/Vary caveat as /schools above — must NOT be `public`.
router.get(
  '/popular',
  cacheControl(300, { staleWhileRevalidate: 600 }),
  schoolsLimiter,
  discoveryCoursesLimiter,
  async (req, res) => {
    try {
      // StudySheet.courseId is a non-nullable Int in the schema, so no
      // null-exclusion filter is needed (and Prisma 6.19+ rejects the
      // `NOT: [{ courseId: null }]` form on required fields). Grouping
      // uses a concrete column count since `_all` was removed in 6.19.
      const grouped = await prisma.studySheet.groupBy({
        by: ['courseId'],
        where: { status: 'published' },
        _count: { courseId: true },
        orderBy: { _count: { courseId: 'desc' } },
        take: POPULAR_COURSES_LIMIT,
      })

      const courseIds = grouped.map((row) => row.courseId)

      if (courseIds.length === 0) return res.json([])

      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: {
          id: true,
          code: true,
          name: true,
          school: { select: { id: true, name: true, short: true } },
        },
      })

      const countMap = new Map(grouped.map((row) => [row.courseId, row._count.courseId]))
      const courseMap = new Map(courses.map((course) => [course.id, course]))

      const result = courseIds
        .map((id) => {
          const course = courseMap.get(id)
          if (!course) return null
          return {
            id: course.id,
            code: course.code,
            name: course.name,
            school: course.school,
            sheetCount: countMap.get(id) || 0,
          }
        })
        .filter(Boolean)

      return res.json(result)
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      log.error(
        { event: 'courses.popular_list_failed', err: error?.message || String(error) },
        'Failed to load popular courses list',
      )
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

/**
 * GET /api/courses/schools-nearby?lat=X&lng=Y&limit=N
 *
 * Returns schools sorted by haversine distance from the given lat/lng.
 * If lat/lng are missing or invalid, falls back to alphabetical (same
 * response shape as /schools). Each row includes `distanceKm` so the
 * client can render "12 km from you" labels and skip coords-less rows
 * to the bottom of the list.
 *
 * Privacy note: lat/lng come from `navigator.geolocation` in the client
 * and are sent per-request as query params. We never persist them.
 * That's why the endpoint is GET-without-body — easy to verify in
 * server logs that no coords ever land in the DB.
 */
router.get(
  '/schools-nearby',
  cacheControl(60),
  schoolsLimiter,
  discoverySchoolsLimiter,
  async (req, res) => {
    const userLat = parseCoord(req.query.lat, 'lat')
    const userLng = parseCoord(req.query.lng, 'lng')
    const limitRaw = Number.parseInt(req.query.limit, 10)
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 50

    try {
      const schools = await prisma.school.findMany({
        select: {
          id: true,
          name: true,
          short: true,
          city: true,
          state: true,
          schoolType: true,
          logoUrl: true,
          latitude: true,
          longitude: true,
        },
        orderBy: { name: 'asc' },
      })

      if (userLat == null || userLng == null) {
        // No coords provided — fall back to alphabetical with null
        // distance. Same response shape so the client can render either
        // mode without branching.
        return res.json(schools.slice(0, limit).map((s) => ({ ...s, distanceKm: null })))
      }

      const scored = schools.map((school) => ({
        ...school,
        distanceKm: distanceKm(userLat, userLng, school.latitude, school.longitude),
      }))

      // Sort: rows with a distance first (ascending), then rows without
      // coords alphabetically at the bottom. Stable order across reqs.
      scored.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return a.name.localeCompare(b.name)
        if (a.distanceKm == null) return 1
        if (b.distanceKm == null) return -1
        return a.distanceKm - b.distanceKm
      })

      return res.json(scored.slice(0, limit))
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      log.error(
        { event: 'courses.schools_nearby_failed', err: error?.message || String(error) },
        'Failed to load nearby schools list',
      )
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

/**
 * GET /api/courses/schools/suggest
 * Returns school matching the authenticated user's email domain (if .edu).
 *
 * MUST stay above /schools/:id — Express matches in registration order
 * and 'suggest' would otherwise be parsed as the :id param and 400.
 */
router.get(
  '/schools/suggest',
  requireAuth,
  schoolsLimiter,
  discoverySchoolsLimiter,
  async (req, res) => {
    try {
      const email = req.user?.email
      if (!email) return res.json({ school: null })

      const domain = email.split('@')[1]?.toLowerCase()
      if (!domain || !domain.endsWith('.edu')) return res.json({ school: null })

      const school = await prisma.school.findFirst({
        where: { emailDomain: domain },
        select: {
          id: true,
          name: true,
          short: true,
          city: true,
          state: true,
          logoUrl: true,
        },
      })

      return res.json({ school: school || null })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

/**
 * GET /api/courses/schools/:id
 *
 * Returns the full detail for a single school — used by the
 * SchoolCourseDetailDrawer on /my-courses. Includes description,
 * stats, website. Does NOT include courses (the caller already has
 * those from /schools).
 */
router.get(
  '/schools/:id',
  cacheControl(300),
  schoolsLimiter,
  discoverySchoolsLimiter,
  async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'Invalid school id.', ERROR_CODES.BAD_REQUEST)
    }

    try {
      const school = await prisma.school.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          short: true,
          city: true,
          state: true,
          schoolType: true,
          logoUrl: true,
          description: true,
          websiteUrl: true,
          enrollmentSize: true,
          foundedYear: true,
          mascot: true,
          // Counts surfaced for the drawer's "X courses on StudyHub" badge.
          _count: {
            select: {
              courses: true,
              enrollments: true,
            },
          },
        },
      })

      if (!school) {
        return sendError(res, 404, 'School not found.', ERROR_CODES.NOT_FOUND)
      }

      return res.json({
        ...school,
        courseCount: school._count.courses,
        memberCount: school._count.enrollments,
        _count: undefined,
      })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      log.error(
        { event: 'courses.school_detail_failed', err: error?.message || String(error) },
        'Failed to load school detail',
      )
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
