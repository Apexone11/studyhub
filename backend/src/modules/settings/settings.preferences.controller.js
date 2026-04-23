const express = require('express')
const prisma = require('../../lib/prisma')
const { cacheControl } = require('../../lib/cacheControl')
const { PREF_BOOLEAN_KEYS, PREF_ENUM_KEYS } = require('./settings.constants')
const {
  AppError,
  parseOptionalInteger,
  parseCourseIds,
  parseCustomCourses,
  validateCourseIds,
  resolveCourseIds,
  getSettingsUser,
  handleSettingsError,
} = require('./settings.service')

const router = express.Router()

router.get('/preferences', cacheControl(60, { staleWhileRevalidate: 120 }), async (req, res) => {
  try {
    const { userId } = req.user
    let prefs = await prisma.userPreferences.findUnique({ where: { userId } })
    if (!prefs) {
      prefs = await prisma.userPreferences.create({ data: { userId } })
    }
    const { id: _id, userId: _uid, ...payload } = prefs
    return res.json(payload)
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.patch('/preferences', async (req, res) => {
  try {
    const { userId } = req.user
    const updates = Object.create(null)

    for (const key of PREF_BOOLEAN_KEYS) {
      if (Object.hasOwn(req.body, key) && typeof req.body[key] === 'boolean') {
        updates[key] = req.body[key]
      }
    }
    for (const [key, allowed] of Object.entries(PREF_ENUM_KEYS)) {
      if (
        Object.hasOwn(req.body, key) &&
        typeof req.body[key] === 'string' &&
        allowed.includes(req.body[key])
      ) {
        updates[key] = req.body[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid preference fields provided.' })
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...updates },
      update: updates,
    })
    const { id: _id, userId: _uid, ...payload } = prefs
    return res.json({ message: 'Preferences saved.', preferences: payload })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.patch('/courses', async (req, res) => {
  const { schoolId, courseIds, customCourses } = req.body || {}

  try {
    const parsedSchoolId = parseOptionalInteger(schoolId, 'schoolId')
    const parsedCourseIds = parseCourseIds(courseIds)
    const parsedCustomCourses = parseCustomCourses(customCourses)

    if ((parsedCourseIds.length > 0 || parsedCustomCourses.length > 0) && parsedSchoolId === null) {
      throw new AppError(400, 'Please select a school before saving your courses.')
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    await validateCourseIds(parsedCourseIds, parsedSchoolId)

    await prisma.$transaction(async (tx) => {
      const resolvedCourseIds = await resolveCourseIds(
        tx,
        parsedCourseIds,
        parsedCustomCourses,
        parsedSchoolId,
      )
      await tx.enrollment.deleteMany({ where: { userId: user.id } })
      if (resolvedCourseIds.length > 0) {
        await tx.enrollment.createMany({
          data: resolvedCourseIds.map((courseId) => ({ userId: user.id, courseId })),
          skipDuplicates: true,
        })
      }
    })

    const updated = await getSettingsUser(user.id)
    return res.json({
      message: updated?._count?.enrollments
        ? 'Courses updated successfully.'
        : 'Courses cleared successfully.',
      user: updated,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

module.exports = router
