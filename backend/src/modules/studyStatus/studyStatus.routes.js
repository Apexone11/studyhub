const { Router } = require('express')
const requireAuth = require('../../middleware/auth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { studyStatusReadLimiter, studyStatusWriteLimiter } = require('../../lib/rateLimiters')
const service = require('./studyStatus.service')

const router = Router()

// GET /api/study-status — all statuses for the authenticated user
router.get('/', requireAuth, studyStatusReadLimiter, async (req, res) => {
  try {
    const statuses = await service.getAllForUser(req.user.userId)
    res.json({ statuses })
  } catch {
    sendError(res, 500, 'Failed to load study statuses.', ERROR_CODES.INTERNAL)
  }
})

// GET /api/study-status/batch?ids=1,2,3 — statuses for specific sheets
router.get('/batch', requireAuth, studyStatusReadLimiter, async (req, res) => {
  try {
    const ids = (req.query.ids || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0)
    if (ids.length === 0) return res.json({ statuses: {} })
    if (ids.length > 100) {
      return sendError(res, 400, 'Too many IDs (max 100).', ERROR_CODES.BAD_REQUEST)
    }
    const statuses = await service.getForSheets(req.user.userId, ids)
    res.json({ statuses })
  } catch {
    sendError(res, 500, 'Failed to load study statuses.', ERROR_CODES.INTERNAL)
  }
})

// PUT /api/study-status/:sheetId — set or clear a status
router.put('/:sheetId', requireAuth, studyStatusWriteLimiter, async (req, res) => {
  try {
    const sheetId = Number(req.params.sheetId)
    if (!sheetId || isNaN(sheetId)) {
      return sendError(res, 400, 'Invalid sheet ID.', ERROR_CODES.BAD_REQUEST)
    }
    const { status } = req.body
    if (status && !service.VALID_STATUSES.includes(status)) {
      return sendError(
        res,
        400,
        `Invalid status. Must be one of: ${service.VALID_STATUSES.join(', ')}`,
        ERROR_CODES.VALIDATION,
      )
    }
    await service.setStatus(req.user.userId, sheetId, status || null)
    res.json({ ok: true })
  } catch {
    sendError(res, 500, 'Failed to update study status.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/study-status/sync — bulk sync from localStorage
router.post('/sync', requireAuth, studyStatusWriteLimiter, async (req, res) => {
  try {
    const { entries } = req.body
    if (!entries || typeof entries !== 'object') {
      return sendError(res, 400, 'entries object is required.', ERROR_CODES.BAD_REQUEST)
    }
    const keys = Object.keys(entries)
    if (keys.length > 200) {
      return sendError(res, 400, 'Too many entries (max 200).', ERROR_CODES.BAD_REQUEST)
    }
    await service.bulkSync(req.user.userId, entries)
    const statuses = await service.getAllForUser(req.user.userId)
    res.json({ statuses })
  } catch {
    sendError(res, 500, 'Failed to sync study statuses.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
