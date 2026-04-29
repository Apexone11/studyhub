const express = require('express')
const multer = require('multer')
const path = require('node:path')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { SCHOOL_LOGOS_DIR, safeUnlinkFile } = require('../../lib/storage')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { validateMagicBytes, validateSvgContent } = require('../../lib/fileSignatures')

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg'])
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: SCHOOL_LOGOS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const safe = `school-${Date.now()}${ext}`
      cb(null, safe)
    },
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(new Error('Only JPG, PNG, WebP, and SVG images are allowed.'))
    }
    cb(null, true)
  },
})

const router = express.Router()

/**
 * GET /api/admin/schools
 * List all schools for admin management.
 */
router.get('/schools', async (req, res) => {
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
        emailDomain: true,
        _count: { select: { courses: true } },
      },
      orderBy: { name: 'asc' },
    })
    return res.json({ schools })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load schools.', ERROR_CODES.SERVER_ERROR)
  }
})

/**
 * POST /api/admin/schools/:id/logo
 * Upload a logo image for a school. Admin only.
 */
router.post('/schools/:id/logo', logoUpload.single('logo'), async (req, res) => {
  try {
    const schoolId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(schoolId)) {
      safeUnlinkFile(req.file?.path)
      return sendError(res, 400, 'Invalid school ID.', ERROR_CODES.UPLOAD_INVALID)
    }

    if (!req.file) {
      return sendError(res, 400, 'No logo file provided.', ERROR_CODES.UPLOAD_INVALID)
    }

    // Validate file content — magic bytes for raster images, content scan for SVG
    if (req.file.mimetype === 'image/svg+xml') {
      const svgCheck = validateSvgContent(req.file.path)
      if (!svgCheck.safe) {
        const fs = require('node:fs')
        try {
          fs.unlinkSync(req.file.path)
        } catch {
          /* ignore */
        }
        return sendError(
          res,
          400,
          'SVG file contains unsafe content and was rejected.',
          ERROR_CODES.UPLOAD_INVALID,
        )
      }
    } else {
      const magicCheck = validateMagicBytes(req.file.path, req.file.mimetype)
      if (!magicCheck.valid) {
        const fs = require('node:fs')
        try {
          fs.unlinkSync(req.file.path)
        } catch {
          /* ignore */
        }
        return sendError(
          res,
          400,
          'File content does not match its declared type.',
          ERROR_CODES.UPLOAD_INVALID,
        )
      }
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, logoUrl: true },
    })

    if (!school) {
      safeUnlinkFile(req.file?.path)
      return sendError(res, 404, 'School not found.', ERROR_CODES.SERVER_ERROR)
    }

    // Delete old logo file if it exists
    if (school.logoUrl) {
      try {
        const fs = require('node:fs')
        const oldPath = path.join(SCHOOL_LOGOS_DIR, path.basename(school.logoUrl))
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
      } catch {
        /* ignore cleanup errors */
      }
    }

    const logoUrl = `/uploads/school-logos/${req.file.filename}`

    await prisma.school.update({
      where: { id: schoolId },
      data: { logoUrl },
    })

    return res.json({ logoUrl })
  } catch (error) {
    safeUnlinkFile(req.file?.path)
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not upload logo.', ERROR_CODES.SERVER_ERROR)
  }
})

/**
 * DELETE /api/admin/schools/:id/logo
 * Remove a school's logo. Admin only.
 */
router.delete('/schools/:id/logo', async (req, res) => {
  try {
    const schoolId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(schoolId)) {
      return sendError(res, 400, 'Invalid school ID.', ERROR_CODES.UPLOAD_INVALID)
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, logoUrl: true },
    })

    if (!school) {
      return sendError(res, 404, 'School not found.', ERROR_CODES.SERVER_ERROR)
    }

    if (school.logoUrl) {
      try {
        const fs = require('node:fs')
        const filePath = path.join(SCHOOL_LOGOS_DIR, path.basename(school.logoUrl))
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch {
        /* ignore cleanup errors */
      }
    }

    await prisma.school.update({
      where: { id: schoolId },
      data: { logoUrl: null },
    })

    return res.json({ message: 'Logo removed.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not remove logo.', ERROR_CODES.SERVER_ERROR)
  }
})

/**
 * PATCH /api/admin/schools/:id
 * Update school metadata (currently emailDomain). Admin only.
 */
router.patch('/schools/:id', async (req, res) => {
  try {
    const schoolId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(schoolId)) {
      return sendError(res, 400, 'Invalid school ID.', ERROR_CODES.UPLOAD_INVALID)
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    })

    if (!school) {
      return sendError(res, 404, 'School not found.', ERROR_CODES.SERVER_ERROR)
    }

    const data = {}

    if ('emailDomain' in req.body) {
      const raw = req.body.emailDomain
      if (raw === null || raw === '') {
        data.emailDomain = null
      } else if (typeof raw === 'string' && raw.trim().length > 0) {
        data.emailDomain = raw.trim().toLowerCase()
      }
    }

    if (Object.keys(data).length === 0) {
      return sendError(res, 400, 'No valid fields to update.', ERROR_CODES.UPLOAD_INVALID)
    }

    const updated = await prisma.school.update({
      where: { id: schoolId },
      data,
      select: { id: true, emailDomain: true },
    })

    return res.json(updated)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not update school.', ERROR_CODES.SERVER_ERROR)
  }
})

module.exports = router
