const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const { sendForbidden } = require('../../lib/accessControl')
const { resolveAttachmentPath } = require('../../lib/storage')
const { sendAttachmentPreview } = require('../../lib/attachmentPreview')
const { attachmentDownloadLimiter } = require('./sheets.constants')
const { canReadSheet, safeDownloadName } = require('./sheets.service')

const router = express.Router()

router.get('/:id/download', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        userId: true,
        title: true,
        content: true,
        contentFormat: true,
        status: true,
        allowDownloads: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    const isOwnerOrAdmin = req.user && (req.user.userId === sheet.userId || req.user.role === 'admin')
    if (!canReadSheet(sheet, req.user)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }
    if (!isOwnerOrAdmin && !sheet.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this sheet.')
    }

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
    })

    const downloadAsHtml = sheet.contentFormat === 'html'
    res.setHeader('Content-Type', downloadAsHtml ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDownloadName(sheet.title, downloadAsHtml ? '.html' : '.md')}"`
    )
    /* Security headers — prevent script execution if browser opens the file inline */
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
    res.send(sheet.content)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/attachment', requireAuth, attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        userId: true,
        status: true,
        attachmentUrl: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    const isOwnerOrAdmin = req.user && (req.user.userId === sheet.userId || req.user.role === 'admin')
    if (!canReadSheet(sheet, req.user)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }
    if (!sheet.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    if (!isOwnerOrAdmin && !sheet.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this sheet.')
    }

    const localPath = resolveAttachmentPath(sheet.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
    })

    res.download(localPath, safeDownloadName(sheet.attachmentName || path.basename(localPath), path.extname(localPath)))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/attachment/preview', requireAuth, attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        userId: true,
        status: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentType: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }
    if (!sheet.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })

    const localPath = resolveAttachmentPath(sheet.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    await sendAttachmentPreview({
      res,
      localPath,
      attachmentName: sheet.attachmentName || path.basename(localPath),
      attachmentType: sheet.attachmentType || '',
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/download', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, allowDownloads: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    const isOwnerOrAdmin = req.user && (req.user.userId === sheet.userId || req.user.role === 'admin')
    if (!canReadSheet(sheet, req.user)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }
    if (!isOwnerOrAdmin && !sheet.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this sheet.')
    }

    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
      select: { downloads: true },
    })

    res.json({ downloads: updated.downloads })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
