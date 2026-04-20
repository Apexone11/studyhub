/**
 * materials.routes.js — HTTP surface for the materials module.
 *
 * Mounted at `/api/materials` in backend/src/index.js.
 *
 * Endpoints:
 *   GET    /api/materials                    - teacher: list my curated materials
 *   POST   /api/materials                    - teacher: create a Material wrapping a sheet or note
 *   PATCH  /api/materials/:id/archive        - teacher: archive a material
 *   POST   /api/materials/assign             - teacher: bulk-assign materials to sections
 *   DELETE /api/materials/assignments/:id    - teacher: remove a single assignment
 *   GET    /api/materials/mine               - student: list my incoming assignments
 *
 * See Week 3 in docs/internal/design-refresh-v2-week2-to-week5-execution.md.
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const materialsService = require('./materials.service')
const { isTeacherAccount } = require('../sections/sections.constants')
const {
  MAX_MATERIAL_TITLE_LENGTH,
  MAX_MATERIAL_INSTRUCTIONS_LENGTH,
  MAX_BULK_ASSIGN_SECTIONS,
  MAX_BULK_ASSIGN_MATERIALS,
} = require('./materials.constants')

const router = express.Router()

function requireTeacher(req, res, next) {
  if (!isTeacherAccount(req.user)) {
    return sendError(res, 403, 'Only teacher accounts can manage materials.', ERROR_CODES.FORBIDDEN)
  }
  return next()
}

function clean(str, max) {
  if (typeof str !== 'string') return ''
  const trimmed = str.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// GET /api/materials/mine  —  student view (must come BEFORE /:id to avoid shadow).
router.get('/mine', readLimiter, requireAuth, async (req, res) => {
  try {
    const assignments = await materialsService.listAssignmentsForStudent(req.user.userId)
    return res.json({ assignments })
  } catch (err) {
    return sendError(
      res,
      500,
      err.message || 'Could not load your assignments.',
      ERROR_CODES.INTERNAL,
    )
  }
})

// GET /api/materials  —  teacher: list my curated materials.
router.get('/', readLimiter, requireAuth, requireTeacher, async (req, res) => {
  try {
    const materials = await materialsService.listMaterialsForTeacher(req.user.userId, {
      includeArchived: String(req.query.includeArchived) === 'true',
    })
    return res.json({ materials })
  } catch (err) {
    return sendError(res, 500, err.message || 'Could not load materials.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/materials  —  teacher: create a Material.
router.post('/', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  const title = clean(req.body?.title, MAX_MATERIAL_TITLE_LENGTH)
  if (!title) {
    return sendError(res, 400, 'Material title is required.', ERROR_CODES.VALIDATION)
  }
  const sheetId = req.body?.sheetId != null ? Number(req.body.sheetId) : null
  const noteId = req.body?.noteId != null ? Number(req.body.noteId) : null
  const instructions = clean(req.body?.instructions || '', MAX_MATERIAL_INSTRUCTIONS_LENGTH)
  const week = req.body?.week != null ? Number(req.body.week) : null

  try {
    const material = await materialsService.createMaterial({
      teacherId: req.user.userId,
      sheetId,
      noteId,
      title,
      instructions,
      week,
    })
    return res.status(201).json({ material })
  } catch (err) {
    if (err.code === 'VALIDATION') return sendError(res, 400, err.message, ERROR_CODES.VALIDATION)
    if (err.code === 'FORBIDDEN') return sendError(res, 403, err.message, ERROR_CODES.FORBIDDEN)
    return sendError(res, 500, err.message || 'Could not create material.', ERROR_CODES.INTERNAL)
  }
})

// PATCH /api/materials/:id/archive  —  teacher: archive a material (soft delete).
router.patch('/:id/archive', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  try {
    const material = await materialsService.archiveMaterial(req.params.id, req.user.userId)
    return res.json({ material })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return sendError(res, 404, err.message, ERROR_CODES.NOT_FOUND)
    if (err.code === 'FORBIDDEN') return sendError(res, 403, err.message, ERROR_CODES.FORBIDDEN)
    return sendError(res, 500, err.message || 'Could not archive material.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/materials/assign  —  teacher: bulk-assign materials to sections.
router.post('/assign', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  const materialIds = Array.isArray(req.body?.materialIds) ? req.body.materialIds : []
  const sectionIds = Array.isArray(req.body?.sectionIds) ? req.body.sectionIds : []
  const dueAt = req.body?.dueAt || null

  if (materialIds.length === 0 || sectionIds.length === 0) {
    return sendError(
      res,
      400,
      'materialIds and sectionIds are required (non-empty arrays).',
      ERROR_CODES.VALIDATION,
    )
  }
  if (materialIds.length > MAX_BULK_ASSIGN_MATERIALS) {
    return sendError(
      res,
      400,
      `materialIds exceeds the ${MAX_BULK_ASSIGN_MATERIALS}-item limit.`,
      ERROR_CODES.VALIDATION,
    )
  }
  if (sectionIds.length > MAX_BULK_ASSIGN_SECTIONS) {
    return sendError(
      res,
      400,
      `sectionIds exceeds the ${MAX_BULK_ASSIGN_SECTIONS}-item limit.`,
      ERROR_CODES.VALIDATION,
    )
  }
  if (dueAt && Number.isNaN(Date.parse(dueAt))) {
    return sendError(res, 400, 'dueAt must be a valid ISO date string.', ERROR_CODES.VALIDATION)
  }

  try {
    const result = await materialsService.bulkAssign({
      teacherId: req.user.userId,
      materialIds,
      sectionIds,
      dueAt,
    })
    return res.status(201).json(result)
  } catch (err) {
    return sendError(res, 500, err.message || 'Bulk assign failed.', ERROR_CODES.INTERNAL)
  }
})

// DELETE /api/materials/assignments/:id  —  teacher: remove an assignment.
router.delete('/assignments/:id', writeLimiter, requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await materialsService.deleteAssignment(req.params.id, req.user.userId)
    return res.json(result)
  } catch (err) {
    if (err.code === 'FORBIDDEN') return sendError(res, 403, err.message, ERROR_CODES.FORBIDDEN)
    return sendError(res, 500, err.message || 'Could not delete assignment.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
