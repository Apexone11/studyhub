const crypto = require('node:crypto')
const { normalizeContentFormat } = require('./htmlSecurity')

const SCAN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  PASSED: 'passed',
  FLAGGED: 'flagged',
  PENDING_REVIEW: 'pending_review',
  QUARANTINED: 'quarantined',
}

const HTML_VERSION_KIND = {
  ORIGINAL: 'original',
  WORKING: 'working',
}

function computeHtmlChecksum(content) {
  return crypto
    .createHash('sha256')
    .update(String(content || ''), 'utf8')
    .digest('hex')
}

function normalizeTitle(value, fallback = 'Untitled draft') {
  const title = String(value || '')
    .trim()
    .slice(0, 160)
  return title || fallback
}

function normalizeDescription(value) {
  return String(value || '')
    .trim()
    .slice(0, 300)
}

function findVersionByKind(sheet, kind) {
  return (sheet.htmlVersions || []).find((entry) => entry.kind === kind) || null
}

async function upsertHtmlVersion(prisma, { sheetId, userId, kind, content, sourceName }) {
  const checksum = computeHtmlChecksum(content)
  return prisma.sheetHtmlVersion.upsert({
    where: {
      sheetId_kind: {
        sheetId,
        kind,
      },
    },
    create: {
      sheetId,
      userId,
      kind,
      sourceName: sourceName || null,
      content,
      checksum,
    },
    update: {
      sourceName: sourceName || null,
      content,
      checksum,
      compressedContent: null,
      compressionAlgo: null,
      archivedAt: null,
    },
  })
}

async function ensureSheetOwnership(prisma, sheetId, user) {
  const sheet = await prisma.studySheet.findUnique({
    where: { id: sheetId },
    include: {
      htmlVersions: true,
      author: { select: { id: true, username: true } },
    },
  })

  if (!sheet) {
    const error = new Error('Sheet not found.')
    error.statusCode = 404
    throw error
  }
  if (sheet.userId !== user.userId && user.role !== 'admin') {
    const error = new Error('Not your sheet.')
    error.statusCode = 403
    throw error
  }
  return sheet
}

async function upsertDraftSheet(
  prisma,
  { sheetId, user, title, courseId, description, allowDownloads, content },
) {
  if (!Number.isInteger(courseId) || courseId <= 0) {
    const error = new Error('Course is required.')
    error.statusCode = 400
    throw error
  }

  if (Number.isInteger(sheetId)) {
    const existing = await ensureSheetOwnership(prisma, sheetId, user)
    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: {
        title: normalizeTitle(title),
        courseId,
        description: normalizeDescription(description),
        allowDownloads: allowDownloads !== false,
        content,
        contentFormat: 'html',
        status: 'draft',
        htmlScanStatus: SCAN_STATUS.QUEUED,
        htmlScanFindings: null,
        htmlRiskTier: 0,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        htmlVersions: true,
      },
    })

    if (existing.contentFormat !== 'html') {
      await prisma.sheetHtmlVersion.deleteMany({ where: { sheetId: existing.id } })
    }

    return updated
  }

  return prisma.studySheet.create({
    data: {
      title: normalizeTitle(title),
      courseId,
      description: normalizeDescription(description),
      allowDownloads: allowDownloads !== false,
      content,
      contentFormat: normalizeContentFormat('html'),
      status: 'draft',
      userId: user.userId,
      htmlScanStatus: SCAN_STATUS.QUEUED,
      htmlScanFindings: null,
      htmlRiskTier: 0,
    },
    include: {
      author: { select: { id: true, username: true } },
      course: { include: { school: true } },
      htmlVersions: true,
    },
  })
}

module.exports = {
  SCAN_STATUS,
  HTML_VERSION_KIND,
  computeHtmlChecksum,
  normalizeTitle,
  normalizeDescription,
  findVersionByKind,
  upsertHtmlVersion,
  ensureSheetOwnership,
  upsertDraftSheet,
}
