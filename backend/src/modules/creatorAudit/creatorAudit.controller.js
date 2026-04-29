const crypto = require('node:crypto')
const net = require('node:net')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { runAudit } = require('./audit.service')
const { CURRENT_CREATOR_RESPONSIBILITY_DOC_VERSION } = require('./creatorAudit.constants')

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
])

function clientIp(req) {
  const forwardedIps = String(req.get?.('x-forwarded-for') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const candidates = [...forwardedIps, req.ip, req.socket?.remoteAddress]
  return candidates.find((candidate) => net.isIP(String(candidate || '').trim())) || ''
}

function isEuRequest(req) {
  const country = String(req.get?.('cf-ipcountry') || req.get?.('x-vercel-ip-country') || '')
    .trim()
    .toUpperCase()
  return EU_COUNTRY_CODES.has(country)
}

function persistedIp(req) {
  const ip = clientIp(req)
  if (!ip) return null
  if (!isEuRequest(req)) return ip.slice(0, 64)
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function persistedUserAgent(req) {
  const value = String(req.get?.('user-agent') || '')
  const printable = value.replace(/[^\x20-\x7e]/g, '')
  return printable.slice(0, 512) || null
}

async function loadAuditEntity(entityType, entityId, userId) {
  if (entityType === 'sheet') {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: entityId },
      select: { id: true, userId: true, title: true, content: true },
    })
    if (!sheet) return null
    if (sheet.userId !== userId) return { forbidden: true }
    return { contentHtml: sheet.content, title: sheet.title }
  }

  if (entityType === 'note') {
    const note = await prisma.note.findUnique({
      where: { id: entityId },
      select: { id: true, userId: true, title: true, content: true },
    })
    if (!note) return null
    if (note.userId !== userId) return { forbidden: true }
    return { contentHtml: note.content, title: note.title }
  }

  const material = await prisma.material.findUnique({
    where: { id: entityId },
    select: {
      id: true,
      teacherId: true,
      title: true,
      instructions: true,
      sheet: { select: { content: true } },
      note: { select: { content: true } },
    },
  })
  if (!material) return null
  if (material.teacherId !== userId) return { forbidden: true }
  return {
    title: material.title,
    contentHtml: [material.instructions, material.sheet?.content, material.note?.content]
      .filter(Boolean)
      .join('\n\n'),
  }
}

async function persistAuditResult(
  entityType,
  entityId,
  userId,
  report,
  expectedContentHtml = undefined,
) {
  const data = {
    lastAuditGrade: report.grade,
    lastAuditReport: report,
    lastAuditedAt: new Date(),
  }

  if (entityType === 'sheet') {
    const where = { id: entityId, userId }
    if (expectedContentHtml !== undefined) where.content = expectedContentHtml
    const result = await prisma.studySheet.updateMany({ where, data })
    if (result.count > 0) return true
    if (expectedContentHtml !== undefined) {
      const current = await loadAuditEntity(entityType, entityId, userId)
      if (!current || current.forbidden) return false
      if (current.contentHtml !== expectedContentHtml) return 'stale'
    }
    return false
  }

  if (entityType === 'note') {
    const where = { id: entityId, userId }
    if (expectedContentHtml !== undefined) where.content = expectedContentHtml
    const result = await prisma.note.updateMany({ where, data })
    if (result.count > 0) return true
    if (expectedContentHtml !== undefined) {
      const current = await loadAuditEntity(entityType, entityId, userId)
      if (!current || current.forbidden) return false
      if (current.contentHtml !== expectedContentHtml) return 'stale'
    }
    return false
  }

  if (expectedContentHtml !== undefined) {
    const current = await loadAuditEntity(entityType, entityId, userId)
    if (!current || current.forbidden) return false
    if (current.contentHtml !== expectedContentHtml) return 'stale'
  }

  const result = await prisma.material.updateMany({
    where: { id: entityId, teacherId: userId },
    data,
  })
  return result.count > 0
}

async function runCreatorAudit(req, res) {
  try {
    const { entityType, entityId } = req.body
    const entity = await loadAuditEntity(entityType, entityId, req.user.userId)
    if (!entity) {
      return sendError(res, 404, 'Content not found.', ERROR_CODES.NOT_FOUND)
    }
    if (entity.forbidden) {
      return sendError(res, 403, 'You can only audit content you own.', ERROR_CODES.FORBIDDEN)
    }

    const report = await runAudit({ contentHtml: entity.contentHtml, userId: req.user.userId })
    const persisted = await persistAuditResult(
      entityType,
      entityId,
      req.user.userId,
      report,
      entity.contentHtml,
    )
    if (persisted === 'stale') {
      return sendError(
        res,
        409,
        'Content changed while the audit was running. Please run the audit again.',
        ERROR_CODES.CONFLICT,
      )
    }
    if (!persisted) {
      return sendError(res, 404, 'Content not found.', ERROR_CODES.NOT_FOUND)
    }

    return res.json({ report, entity: { type: entityType, id: entityId, title: entity.title } })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Failed to run creator audit.', ERROR_CODES.INTERNAL)
  }
}

async function getConsent(req, res) {
  try {
    const consent = await prisma.creatorAuditConsent.findUnique({
      where: { userId: req.user.userId },
      select: { docVersion: true, acceptedAt: true },
    })
    return res.json({
      accepted: consent?.docVersion === CURRENT_CREATOR_RESPONSIBILITY_DOC_VERSION,
      docVersion: consent?.docVersion || null,
      acceptedAt: consent?.acceptedAt?.toISOString() || null,
      currentDocVersion: CURRENT_CREATOR_RESPONSIBILITY_DOC_VERSION,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Failed to load creator audit consent.', ERROR_CODES.INTERNAL)
  }
}

async function acceptConsent(req, res) {
  try {
    const { docVersion } = req.body
    if (docVersion !== CURRENT_CREATOR_RESPONSIBILITY_DOC_VERSION) {
      return sendError(
        res,
        409,
        'Creator responsibility document version has changed.',
        ERROR_CODES.CONFLICT,
      )
    }

    const existingConsent = await prisma.creatorAuditConsent.findUnique({
      where: { userId: req.user.userId },
      select: { docVersion: true, acceptedAt: true },
    })

    if (existingConsent?.docVersion === docVersion) {
      return res.json({
        accepted: true,
        docVersion: existingConsent.docVersion,
        acceptedAt: existingConsent.acceptedAt.toISOString(),
      })
    }

    const consent = await prisma.creatorAuditConsent.upsert({
      where: { userId: req.user.userId },
      create: {
        userId: req.user.userId,
        docVersion,
        ipAddress: persistedIp(req),
        userAgent: persistedUserAgent(req),
      },
      update: {
        docVersion,
        acceptedAt: new Date(),
        ipAddress: persistedIp(req),
        userAgent: persistedUserAgent(req),
      },
      select: { docVersion: true, acceptedAt: true },
    })

    return res.status(201).json({
      accepted: true,
      docVersion: consent.docVersion,
      acceptedAt: consent.acceptedAt.toISOString(),
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Failed to save creator audit consent.', ERROR_CODES.INTERNAL)
  }
}

async function revokeConsent(req, res) {
  try {
    await prisma.creatorAuditConsent.deleteMany({ where: { userId: req.user.userId } })
    return res.json({ accepted: false, docVersion: null, acceptedAt: null })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Failed to revoke creator audit consent.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  acceptConsent,
  getConsent,
  loadAuditEntity,
  persistAuditResult,
  persistedIp,
  persistedUserAgent,
  revokeConsent,
  runCreatorAudit,
}
