/**
 * studyGroups.resources.routes.js — Group resources sub-router
 *
 * Shared Resources endpoints:
 * - GET/POST /api/study-groups/:id/resources
 * - PATCH/DELETE /api/study-groups/:id/resources/:resourceId
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const {
  parseId,
  requireGroupMember,
  isGroupAdmin,
  validateTitle,
  validateDescription,
  validateResourceUrl,
} = require('./studyGroups.helpers')

const router = express.Router({ mergeParams: true })

/**
 * GET /:id/resources
 * List group resources (pinned first)
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

    const [resources, total] = await Promise.all([
      prisma.groupResource.findMany({
        where: { groupId },
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.groupResource.count({ where: { groupId } }),
    ])

    const formatted = resources.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      userId: r.userId,
      user: r.user,
      title: r.title,
      description: r.description,
      resourceType: r.resourceType,
      resourceUrl: r.resourceUrl,
      sheetId: r.sheetId,
      noteId: r.noteId,
      pinned: r.pinned,
      createdAt: r.createdAt,
    }))

    res.json({ resources: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /:id/resources
 * Add a resource (members only)
 */
router.post('/', writeLimiter, requireAuth, async (req, res) => {
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

    const { title, description = '', resourceType = 'link', resourceUrl, sheetId, noteId } = req.body

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

    // Validate resourceType
    if (!['link', 'sheet', 'note', 'file'].includes(resourceType)) {
      return res.status(400).json({ error: 'Invalid resourceType.' })
    }

    // Validate URL if provided
    let validUrl = null
    if (resourceUrl) {
      validUrl = validateResourceUrl(resourceUrl)
      if (!validUrl) {
        return res.status(400).json({ error: 'Invalid resource URL. Must be a valid http or https URL.' })
      }
    }

    const resource = await prisma.groupResource.create({
      data: {
        groupId,
        userId: req.user.userId,
        title: validTitle,
        description: validDesc,
        resourceType,
        resourceUrl: validUrl,
        sheetId: sheetId ? parseId(sheetId) : null,
        noteId: noteId ? parseId(noteId) : null,
      },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.status(201).json({
      id: resource.id,
      groupId: resource.groupId,
      userId: resource.userId,
      user: resource.user,
      title: resource.title,
      description: resource.description,
      resourceType: resource.resourceType,
      resourceUrl: resource.resourceUrl,
      sheetId: resource.sheetId,
      noteId: resource.noteId,
      pinned: resource.pinned,
      createdAt: resource.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /:id/resources/:resourceId
 * Update resource (author or admin)
 */
router.patch('/:resourceId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const resourceId = parseId(req.params.resourceId)

    if (groupId === null || resourceId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const resource = await prisma.groupResource.findUnique({
      where: { id: resourceId },
    })

    if (!resource || resource.groupId !== groupId) {
      return res.status(404).json({ error: 'Resource not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (resource.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { title, description, resourceType, resourceUrl, pinned } = req.body
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

    if (resourceType !== undefined) {
      if (!['link', 'sheet', 'note', 'file'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType.' })
      }
      updates.resourceType = resourceType
    }

    if (resourceUrl !== undefined) {
      updates.resourceUrl = resourceUrl
    }

    if (pinned !== undefined && isAdmin) {
      updates.pinned = Boolean(pinned)
    }

    const updated = await prisma.groupResource.update({
      where: { id: resourceId },
      data: updates,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      user: updated.user,
      title: updated.title,
      description: updated.description,
      resourceType: updated.resourceType,
      resourceUrl: updated.resourceUrl,
      sheetId: updated.sheetId,
      noteId: updated.noteId,
      pinned: updated.pinned,
      createdAt: updated.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /:id/resources/:resourceId
 * Delete resource (author or admin)
 */
router.delete('/:resourceId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const resourceId = parseId(req.params.resourceId)

    if (groupId === null || resourceId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const resource = await prisma.groupResource.findUnique({
      where: { id: resourceId },
    })

    if (!resource || resource.groupId !== groupId) {
      return res.status(404).json({ error: 'Resource not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (resource.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    await prisma.groupResource.delete({
      where: { id: resourceId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
