/**
 * sections.routes.js — HTTP surface for the sections module.
 *
 * Mounted at `/api/sections` in backend/src/index.js.
 *
 * Endpoints:
 *   GET    /api/sections                          - list my sections (teacher) or enrollments (student)
 *   POST   /api/sections                          - teacher: create a new section
 *   GET    /api/sections/:id                      - section details (teacher-owner or enrolled student)
 *   PATCH  /api/sections/:id                      - teacher: update section fields
 *   DELETE /api/sections/:id                      - teacher: delete section (cascades assignments + enrollments)
 *   GET    /api/sections/:id/students             - teacher: list enrolled students
 *   POST   /api/sections/join                     - student: self-enroll via join code
 *   DELETE /api/sections/:id/enrollments/:userId  - teacher or self: remove an enrollment
 *
 * See Week 3 entry in docs/internal/design-refresh-v2-week2-to-week5-execution.md.
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const sectionsService = require('./sections.service')
const {
  MAX_SECTION_NAME_LENGTH,
  MAX_SECTION_DESCRIPTION_LENGTH,
  isTeacherAccount,
} = require('./sections.constants')

const router = express.Router()

function requireTeacher(req, res, next) {
  if (!isTeacherAccount(req.user)) {
    return sendError(res, 403, 'Only teacher accounts can manage sections.', ERROR_CODES.FORBIDDEN)
  }
  return next()
}

function clean(str, max) {
  if (typeof str !== 'string') return ''
  const trimmed = str.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// GET /api/sections
router.get('/', readLimiter, requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId
    if (isTeacherAccount(req.user)) {
      const sections = await sectionsService.listSectionsForTeacher(userId, {
        includeArchived: String(req.query.includeArchived) === 'true',
      })
      return res.json({ role: 'teacher', sections })
    }
    const enrollments = await sectionsService.listSectionsForStudent(userId)
    return res.json({ role: 'student', enrollments })
  } catch (err) {
    return sendError(res, 500, err.message || 'Could not load sections.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/sections
router.post('/', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  const name = clean(req.body?.name, MAX_SECTION_NAME_LENGTH)
  if (!name) {
    return sendError(res, 400, 'Section name is required.', ERROR_CODES.VALIDATION)
  }
  const description = clean(req.body?.description || '', MAX_SECTION_DESCRIPTION_LENGTH)
  const courseId = req.body?.courseId != null ? Number(req.body.courseId) : null
  if (courseId != null && Number.isNaN(courseId)) {
    return sendError(res, 400, 'courseId must be a number.', ERROR_CODES.VALIDATION)
  }

  try {
    const section = await sectionsService.createSection({
      teacherId: req.user.userId,
      courseId,
      name,
      description,
    })
    return res.status(201).json({ section })
  } catch (err) {
    if (err.code === 'SECTION_LIMIT') {
      return sendError(res, 400, err.message, 'SECTION_LIMIT')
    }
    if (err.code === 'SECTION_JOIN_CODE_EXHAUSTED') {
      return sendError(res, 503, err.message, 'SECTION_JOIN_CODE_EXHAUSTED')
    }
    return sendError(res, 500, err.message || 'Could not create section.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/sections/join
router.post('/join', writeLimiter, requireAuth, async (req, res) => {
  const joinCode =
    typeof req.body?.joinCode === 'string' ? req.body.joinCode.trim().toUpperCase() : ''
  if (!joinCode) {
    return sendError(res, 400, 'joinCode is required.', ERROR_CODES.VALIDATION)
  }
  try {
    const enrollment = await sectionsService.enrollStudentByJoinCode(joinCode, req.user.userId)
    return res.status(201).json({ enrollment })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return sendError(res, 404, err.message, ERROR_CODES.NOT_FOUND)
    if (err.code === 'ARCHIVED') return sendError(res, 410, err.message, 'SECTION_ARCHIVED')
    if (err.code === 'SELF_ENROLL') return sendError(res, 400, err.message, 'SELF_ENROLL')
    if (err.code === 'ALREADY_ENROLLED') return sendError(res, 409, err.message, 'ALREADY_ENROLLED')
    return sendError(res, 500, err.message || 'Could not enroll.', ERROR_CODES.INTERNAL)
  }
})

// GET /api/sections/:id
router.get('/:id', readLimiter, requireAuth, async (req, res) => {
  try {
    const section = await sectionsService.getSectionById(req.params.id)
    if (!section) return sendError(res, 404, 'Section not found.', ERROR_CODES.NOT_FOUND)
    // Visibility: teacher-owner OR enrolled student.
    const userId = req.user.userId
    if (section.teacherId !== userId) {
      const enrollments = await sectionsService.listEnrollments(section.id)
      const enrolled = enrollments.some((e) => e.userId === userId)
      if (!enrolled) return sendError(res, 404, 'Section not found.', ERROR_CODES.NOT_FOUND)
    }
    return res.json({ section })
  } catch (err) {
    return sendError(res, 500, err.message || 'Could not load section.', ERROR_CODES.INTERNAL)
  }
})

// PATCH /api/sections/:id
router.patch('/:id', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  const patch = {}
  if (req.body?.name !== undefined) patch.name = clean(req.body.name, MAX_SECTION_NAME_LENGTH)
  if (req.body?.description !== undefined)
    patch.description = clean(req.body.description, MAX_SECTION_DESCRIPTION_LENGTH)
  if (req.body?.courseId !== undefined)
    patch.courseId = req.body.courseId == null ? null : Number(req.body.courseId)
  if (req.body?.archived !== undefined) patch.archived = Boolean(req.body.archived)

  try {
    const section = await sectionsService.updateSection(req.params.id, req.user.userId, patch)
    return res.json({ section })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return sendError(res, 404, err.message, ERROR_CODES.NOT_FOUND)
    if (err.code === 'FORBIDDEN') return sendError(res, 403, err.message, ERROR_CODES.FORBIDDEN)
    return sendError(res, 500, err.message || 'Could not update section.', ERROR_CODES.INTERNAL)
  }
})

// DELETE /api/sections/:id
router.delete('/:id', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await sectionsService.deleteSection(req.params.id, req.user.userId)
    return res.json(result)
  } catch (err) {
    if (err.code === 'FORBIDDEN') return sendError(res, 403, err.message, ERROR_CODES.FORBIDDEN)
    return sendError(res, 500, err.message || 'Could not delete section.', ERROR_CODES.INTERNAL)
  }
})

// GET /api/sections/:id/students
router.get('/:id/students', readLimiter, requireAuth, requireTeacher, async (req, res) => {
  try {
    const section = await sectionsService.getSectionById(req.params.id)
    if (!section) return sendError(res, 404, 'Section not found.', ERROR_CODES.NOT_FOUND)
    if (section.teacherId !== req.user.userId) {
      return sendError(res, 403, 'You do not own this section.', ERROR_CODES.FORBIDDEN)
    }
    const enrollments = await sectionsService.listEnrollments(section.id)
    return res.json({ enrollments })
  } catch (err) {
    return sendError(res, 500, err.message || 'Could not load roster.', ERROR_CODES.INTERNAL)
  }
})

// DELETE /api/sections/:id/enrollments/:userId
router.delete('/:id/enrollments/:userId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const result = await sectionsService.removeEnrollment(
      req.params.id,
      req.params.userId,
      req.user.userId,
    )
    return res.json(result)
  } catch (err) {
    if (err.code === 'NOT_FOUND') return sendError(res, 404, err.message, ERROR_CODES.NOT_FOUND)
    if (err.code === 'FORBIDDEN') return sendError(res, 403, err.message, ERROR_CODES.FORBIDDEN)
    return sendError(res, 500, err.message || 'Could not remove enrollment.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
