const express = require('express')
const crypto = require('node:crypto')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { createProvenanceToken, verifyProvenanceToken, detectTampering } = require('../../lib/provenance')
const { readLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.use(readLimiter)

// POST /api/provenance/:sheetId — Generate provenance manifest (owner only)
router.post('/:sheetId', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.sheetId, 10)

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, content: true, createdAt: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the sheet owner can generate a provenance manifest.' })
    }

    const token = createProvenanceToken(
      sheet.id,
      sheet.userId,
      sheet.content,
      sheet.createdAt,
    )

    const manifest = await prisma.provenanceManifest.upsert({
      where: { sheetId },
      update: {
        originHash: token.originHash,
        encryptedToken: token.encryptedToken,
        algorithm: token.algorithm,
        iv: token.iv,
        authTag: token.authTag,
      },
      create: {
        sheetId,
        originHash: token.originHash,
        encryptedToken: token.encryptedToken,
        algorithm: token.algorithm,
        iv: token.iv,
        authTag: token.authTag,
      },
    })

    res.json({
      manifest: {
        id: manifest.id,
        sheetId: manifest.sheetId,
        originHash: manifest.originHash,
        algorithm: manifest.algorithm,
        createdAt: manifest.createdAt,
      },
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// GET /api/provenance/:sheetId — Get provenance status (any authenticated user)
router.get('/:sheetId', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.sheetId, 10)

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const manifest = await prisma.provenanceManifest.findUnique({
      where: { sheetId },
      select: { originHash: true, algorithm: true, createdAt: true },
    })

    if (!manifest) {
      return res.json({ hasProvenance: false })
    }

    res.json({
      hasProvenance: true,
      originHash: manifest.originHash,
      algorithm: manifest.algorithm,
      createdAt: manifest.createdAt,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// GET /api/provenance/:sheetId/verify — Verify + tamper check (admin only)
router.get('/:sheetId/verify', requireAuth, requireAdmin, async (req, res) => {
  const sheetId = Number.parseInt(req.params.sheetId, 10)

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const manifest = await prisma.provenanceManifest.findUnique({
      where: { sheetId },
    })

    if (!manifest) {
      return res.status(404).json({ error: 'No provenance manifest found for this sheet.' })
    }

    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, content: true },
    })

    if (!sheet) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }

    const verification = verifyProvenanceToken(
      manifest.encryptedToken,
      manifest.iv,
      manifest.authTag,
      manifest.algorithm,
    )

    const tamperResult = detectTampering(sheet, manifest)

    const currentContentHash = crypto
      .createHash('sha256')
      .update(String(sheet.content))
      .digest('hex')

    res.json({
      valid: verification.valid,
      tampered: tamperResult.tampered,
      payload: verification.valid
        ? {
            userId: verification.payload.userId,
            contentHash: verification.payload.contentHash,
            createdAt: verification.payload.createdAt,
            version: verification.payload.version,
          }
        : null,
      currentContentHash,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// DELETE /api/provenance/:sheetId — Remove provenance manifest (owner or admin)
router.delete('/:sheetId', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.sheetId, 10)

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the sheet owner or an admin can delete a provenance manifest.' })
    }

    const manifest = await prisma.provenanceManifest.findUnique({
      where: { sheetId },
      select: { id: true },
    })

    if (!manifest) {
      return res.status(404).json({ error: 'No provenance manifest found for this sheet.' })
    }

    await prisma.provenanceManifest.delete({ where: { sheetId } })

    res.json({ message: 'Provenance manifest deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
