/**
 * studyGroups.sessions.routes.js — Group sessions sub-router
 *
 * Scheduled Sessions endpoints:
 * - GET/POST /api/study-groups/:id/sessions
 * - PATCH/DELETE /api/study-groups/:id/sessions/:sessionId
 * - POST /api/study-groups/:id/sessions/:sessionId/rsvp
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { createNotifications } = require('../../lib/notify')
const log = require('../../lib/logger')
const prisma = require('../../lib/prisma')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const {
  parseId,
  requireGroupMember,
  isGroupAdminOrMod,
  validateTitle,
  validateDescription,
} = require('./studyGroups.helpers')

const router = express.Router({ mergeParams: true })

// CLAUDE.md A11 — defense in depth on every session write
// (POST/PATCH/DELETE/RSVP). Short-circuits GETs.
router.use(originAllowlist())

/**
 * GET /:id/sessions
 * List sessions (upcoming first)
 */
router.get('/', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { limit = 50, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    const [sessions, total] = await Promise.all([
      prisma.groupSession.findMany({
        where: { groupId },
        include: {
          rsvps: {
            select: { status: true, userId: true },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.groupSession.count({ where: { groupId } }),
    ])

    const formatted = sessions.map((s) => {
      const userRsvp = s.rsvps.find((r) => r.userId === req.user.userId)
      const goingCount = s.rsvps.filter((r) => r.status === 'going').length
      const maybeCount = s.rsvps.filter((r) => r.status === 'maybe').length
      return {
        id: s.id,
        groupId: s.groupId,
        title: s.title,
        description: s.description,
        location: s.location,
        scheduledAt: s.scheduledAt,
        durationMins: s.durationMins,
        recurring: s.recurring,
        status: s.status,
        userRsvpStatus: userRsvp?.status || null,
        rsvpCount: goingCount,
        rsvpMaybeCount: maybeCount,
        rsvpTotal: s.rsvps.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }
    })

    res.json({ sessions: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /:id/sessions
 * Create session (admin/moderator)
 */
router.post('/', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    const {
      title,
      description = '',
      location = '',
      scheduledAt,
      durationMins = 60,
      recurring,
    } = req.body

    // Validate title
    const validTitle = validateTitle(title)
    if (!validTitle) {
      return res.status(400).json({ error: 'Title required, max 200 chars.' })
    }

    // Validate description
    const validDesc = validateDescription(description)
    if (validDesc === null) {
      return res.status(400).json({ error: 'Description max 2000 chars.' })
    }

    // Validate scheduledAt
    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt required.' })
    }
    const scheduledDate = new Date(scheduledAt)
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt.' })
    }

    // Validate durationMins
    const duration = parseInt(durationMins, 10)
    if (Number.isNaN(duration) || duration < 1 || duration > 1440) {
      return res.status(400).json({ error: 'durationMins must be 1-1440.' })
    }

    // Validate recurring
    if (recurring && !['weekly', 'biweekly'].includes(recurring)) {
      return res.status(400).json({ error: 'Invalid recurring value.' })
    }

    const session = await prisma.groupSession.create({
      data: {
        groupId,
        title: validTitle,
        description: validDesc,
        location,
        scheduledAt: scheduledDate,
        durationMins: duration,
        recurring: recurring || null,
      },
    })

    // Notify all active group members (except creator) about the new session
    try {
      const groupData = await prisma.studyGroup.findUnique({
        where: { id: groupId },
        select: { name: true },
      })

      const members = await prisma.studyGroupMember.findMany({
        where: {
          groupId,
          status: 'active',
          userId: { not: req.user.userId }, // exclude the session creator
        },
        select: { userId: true },
      })

      if (members.length > 0 && groupData) {
        await createNotifications(
          prisma,
          members.map((member) => ({
            userId: member.userId,
            type: 'group_session',
            message: `${req.user.username} scheduled a session in ${groupData.name}: ${validTitle}`,
            actorId: req.user.userId,
            linkPath: `/study-groups/${groupId}`,
          })),
        )
      }
    } catch (notifErr) {
      // Fire-and-forget: don't fail the request
      log.warn(
        { event: 'studyGroups.sessions.notify_failed', err: notifErr.message },
        'Failed to create session notifications',
      )
    }

    res.status(201).json({
      id: session.id,
      groupId: session.groupId,
      title: session.title,
      description: session.description,
      location: session.location,
      scheduledAt: session.scheduledAt,
      durationMins: session.durationMins,
      recurring: session.recurring,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /:id/sessions/:sessionId
 * Update session (admin/moderator)
 */
router.patch('/:sessionId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const sessionId = parseId(req.params.sessionId)

    if (groupId === null || sessionId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.groupId !== groupId) {
      return res.status(404).json({ error: 'Session not found.' })
    }

    const { title, description, location, scheduledAt, durationMins, recurring, status } = req.body
    const updates = {}

    if (title !== undefined) {
      const validTitle = validateTitle(title)
      if (!validTitle) {
        return res.status(400).json({ error: 'Title required, max 200 chars.' })
      }
      updates.title = validTitle
    }

    if (description !== undefined) {
      const validDesc = validateDescription(description)
      if (validDesc === null) {
        return res.status(400).json({ error: 'Description max 2000 chars.' })
      }
      updates.description = validDesc
    }

    if (location !== undefined) {
      updates.location = location
    }

    if (scheduledAt !== undefined) {
      const scheduledDate = new Date(scheduledAt)
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduledAt.' })
      }
      updates.scheduledAt = scheduledDate
    }

    if (durationMins !== undefined) {
      const duration = parseInt(durationMins, 10)
      if (Number.isNaN(duration) || duration < 1 || duration > 1440) {
        return res.status(400).json({ error: 'durationMins must be 1-1440.' })
      }
      updates.durationMins = duration
    }

    if (recurring !== undefined) {
      if (recurring && !['weekly', 'biweekly'].includes(recurring)) {
        return res.status(400).json({ error: 'Invalid recurring value.' })
      }
      updates.recurring = recurring || null
    }

    if (status !== undefined) {
      if (!['upcoming', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' })
      }
      updates.status = status
    }

    updates.updatedAt = new Date()

    const updated = await prisma.groupSession.update({
      where: { id: sessionId },
      data: updates,
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      title: updated.title,
      description: updated.description,
      location: updated.location,
      scheduledAt: updated.scheduledAt,
      durationMins: updated.durationMins,
      recurring: updated.recurring,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /:id/sessions/:sessionId
 * Delete session (admin/moderator)
 */
router.delete('/:sessionId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const sessionId = parseId(req.params.sessionId)

    if (groupId === null || sessionId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.groupId !== groupId) {
      return res.status(404).json({ error: 'Session not found.' })
    }

    await prisma.groupSession.delete({
      where: { id: sessionId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /:id/sessions/:sessionId/rsvp
 * RSVP to session (member)
 */
router.post('/:sessionId/rsvp', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const sessionId = parseId(req.params.sessionId)

    if (groupId === null || sessionId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.groupId !== groupId) {
      return res.status(404).json({ error: 'Session not found.' })
    }

    const { status = 'going' } = req.body

    if (!['going', 'maybe', 'not_going'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' })
    }

    // Upsert RSVP
    const rsvp = await prisma.groupSessionRsvp.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: req.user.userId,
        },
      },
      create: {
        sessionId,
        userId: req.user.userId,
        status,
      },
      update: {
        status,
      },
    })

    res.json({
      id: rsvp.id,
      sessionId: rsvp.sessionId,
      userId: rsvp.userId,
      status: rsvp.status,
      createdAt: rsvp.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
