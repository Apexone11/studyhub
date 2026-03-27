const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { cleanupAttachmentIfUnused } = require('../../lib/storage')
const { sheetWriteLimiter } = require('./sheets.constants')

const readController = require('./sheets.read.controller')
const createController = require('./sheets.create.controller')
const updateController = require('./sheets.update.controller')

const router = express.Router()

/* Mount read, create, and update sub-routers */
router.use(readController)
router.use(createController)
router.use(updateController)

/* DELETE /:id — delete a sheet */
router.delete('/:id', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, attachmentUrl: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: sheet.userId,
      message: 'Not your sheet.',
      targetType: 'sheet',
      targetId: sheetId,
    })) return

    await prisma.studySheet.delete({ where: { id: sheetId } })
    await cleanupAttachmentIfUnused(prisma, sheet.attachmentUrl, {
      route: req.originalUrl,
      sheetId,
    })
    res.json({ message: 'Sheet deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
