const crypto = require('node:crypto')
const { normalizeContentFormat, validateHtmlForSubmission } = require('./htmlSecurity')
const { scanBufferWithClamAv } = require('./clamav')

const SCAN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
}

const HTML_VERSION_KIND = {
  ORIGINAL: 'original',
  WORKING: 'working',
}

const scanTimers = new Map()

function computeHtmlChecksum(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex')
}

function normalizeTitle(value, fallback = 'Untitled draft') {
  const title = String(value || '').trim().slice(0, 160)
  return title || fallback
}

function normalizeDescription(value) {
  return String(value || '').trim().slice(0, 300)
}

function normalizeFindings(policyValidation, avResult) {
  const findings = []

  if (!policyValidation.ok) {
    for (const issue of policyValidation.issues) {
      findings.push({
        source: 'policy',
        severity: 'high',
        message: issue,
      })
    }
  }

  if (avResult) {
    if (avResult.status === 'infected') {
      findings.push({
        source: 'av',
        severity: 'critical',
        message: avResult.threat || 'Malicious payload detected by antivirus.',
      })
    } else if (avResult.status === 'error') {
      findings.push({
        source: 'av',
        severity: 'high',
        message: avResult.message || 'Antivirus scanner unavailable.',
      })
    }
  }

  return findings
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

async function upsertDraftSheet(prisma, { sheetId, user, title, courseId, description, allowDownloads, content }) {
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
    },
    include: {
      author: { select: { id: true, username: true } },
      course: { include: { school: true } },
      htmlVersions: true,
    },
  })
}

async function runHtmlScanNow(prisma, { sheetId }) {
  const sheet = await prisma.studySheet.findUnique({
    where: { id: sheetId },
    include: { htmlVersions: true },
  })

  if (!sheet || sheet.contentFormat !== 'html') {
    return {
      status: SCAN_STATUS.PASSED,
      findings: [],
    }
  }

  const workingVersion = findVersionByKind(sheet, HTML_VERSION_KIND.WORKING)
  const htmlToScan = String(workingVersion?.content || sheet.content || '')

  await prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      htmlScanStatus: SCAN_STATUS.RUNNING,
      htmlScanUpdatedAt: new Date(),
    },
  })

  const policyValidation = validateHtmlForSubmission(htmlToScan)
  let avResult = null

  if (policyValidation.ok) {
    avResult = await scanBufferWithClamAv(Buffer.from(htmlToScan, 'utf8'))
  }

  const findings = normalizeFindings(policyValidation, avResult)
  const nextStatus = findings.length > 0 ? SCAN_STATUS.FAILED : SCAN_STATUS.PASSED

  await prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      htmlScanStatus: nextStatus,
      htmlScanFindings: findings,
      htmlScanUpdatedAt: new Date(),
      content: htmlToScan,
      status: sheet.status === 'pending_review' && nextStatus !== SCAN_STATUS.PASSED && !sheet.htmlScanAcknowledgedAt
        ? 'draft'
        : sheet.status,
    },
  })

  return {
    status: nextStatus,
    findings,
  }
}

function scheduleHtmlScan(prisma, { sheetId, delayMs = 450 }) {
  const safeDelay = Number.isFinite(delayMs) ? Math.max(20, Math.round(delayMs)) : 450

  const existing = scanTimers.get(sheetId)
  if (existing) {
    clearTimeout(existing)
    scanTimers.delete(sheetId)
  }

  return prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      htmlScanStatus: SCAN_STATUS.QUEUED,
      htmlScanUpdatedAt: new Date(),
      htmlScanFindings: null,
    },
  }).finally(() => {
    const timer = setTimeout(async () => {
      scanTimers.delete(sheetId)
      try {
        await runHtmlScanNow(prisma, { sheetId })
      } catch (scanErr) {
        console.error(`[htmlDraftWorkflow] Background scan failed for sheet ${sheetId}:`, scanErr)
        await prisma.studySheet.update({
          where: { id: sheetId },
          data: {
            htmlScanStatus: SCAN_STATUS.FAILED,
            htmlScanFindings: [{ source: 'system', severity: 'high', message: 'Background scan failed to complete.' }],
            htmlScanUpdatedAt: new Date(),
          },
        }).catch((updateErr) => {
          console.error(`[htmlDraftWorkflow] Failed to update scan status for sheet ${sheetId}:`, updateErr)
        })
      }
    }, safeDelay)

    if (typeof timer.unref === 'function') timer.unref()
    scanTimers.set(sheetId, timer)
  })
}

async function importHtmlDraft(prisma, { sheetId, user, title, courseId, description, allowDownloads, html, sourceName }) {
  const content = String(html || '')
  if (!content.trim()) {
    const error = new Error('HTML file content is required.')
    error.statusCode = 400
    throw error
  }

  const draft = await upsertDraftSheet(prisma, {
    sheetId,
    user,
    title,
    courseId,
    description,
    allowDownloads,
    content,
  })

  await upsertHtmlVersion(prisma, {
    sheetId: draft.id,
    userId: user.userId,
    kind: HTML_VERSION_KIND.ORIGINAL,
    content,
    sourceName,
  })

  await upsertHtmlVersion(prisma, {
    sheetId: draft.id,
    userId: user.userId,
    kind: HTML_VERSION_KIND.WORKING,
    content,
    sourceName,
  })

  await scheduleHtmlScan(prisma, { sheetId: draft.id, delayMs: 60 })

  return draft.id
}

async function updateWorkingHtmlDraft(prisma, { sheetId, user, title, courseId, description, allowDownloads, html }) {
  const content = String(html || '')
  if (!content.trim()) {
    const error = new Error('HTML content cannot be empty.')
    error.statusCode = 400
    throw error
  }

  const sheet = await ensureSheetOwnership(prisma, sheetId, user)
  if (sheet.contentFormat !== 'html') {
    const error = new Error('Working HTML updates are only available for HTML drafts.')
    error.statusCode = 400
    throw error
  }

  const parsedCourseId = Number.parseInt(courseId, 10)
  if (!Number.isInteger(parsedCourseId) || parsedCourseId <= 0) {
    const error = new Error('Course is required.')
    error.statusCode = 400
    throw error
  }

  await prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      title: normalizeTitle(title, sheet.title || 'Untitled draft'),
      courseId: parsedCourseId,
      description: normalizeDescription(description),
      allowDownloads: allowDownloads !== false,
      content,
      status: 'draft',
      htmlScanStatus: SCAN_STATUS.QUEUED,
      htmlScanFindings: null,
    },
  })

  await upsertHtmlVersion(prisma, {
    sheetId,
    userId: user.userId,
    kind: HTML_VERSION_KIND.WORKING,
    content,
    sourceName: findVersionByKind(sheet, HTML_VERSION_KIND.WORKING)?.sourceName || 'working.html',
  })

  await scheduleHtmlScan(prisma, { sheetId, delayMs: 700 })
}

async function getHtmlScanStatus(prisma, { sheetId, user }) {
  const sheet = await ensureSheetOwnership(prisma, sheetId, user)

  return {
    status: sheet.htmlScanStatus || SCAN_STATUS.QUEUED,
    findings: Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : [],
    updatedAt: sheet.htmlScanUpdatedAt,
    acknowledgedAt: sheet.htmlScanAcknowledgedAt,
    hasOriginalVersion: Boolean(findVersionByKind(sheet, HTML_VERSION_KIND.ORIGINAL)),
    hasWorkingVersion: Boolean(findVersionByKind(sheet, HTML_VERSION_KIND.WORKING)),
    originalSourceName: findVersionByKind(sheet, HTML_VERSION_KIND.ORIGINAL)?.sourceName || null,
  }
}

async function acknowledgeHtmlScanWarning(prisma, { sheetId, user }) {
  await ensureSheetOwnership(prisma, sheetId, user)
  await prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      htmlScanAcknowledgedAt: new Date(),
    },
  })
}

async function submitHtmlDraftForReview(prisma, { sheetId, user }) {
  const sheet = await ensureSheetOwnership(prisma, sheetId, user)

  if (sheet.contentFormat !== 'html') {
    const error = new Error('Only HTML drafts can be submitted through this workflow.')
    error.statusCode = 400
    throw error
  }
  if (!sheet.title?.trim()) {
    const error = new Error('Title is required.')
    error.statusCode = 400
    throw error
  }
  if (!sheet.description?.trim()) {
    const error = new Error('Description is required before submit.')
    error.statusCode = 400
    throw error
  }
  if (!sheet.content?.trim()) {
    const error = new Error('HTML content is required.')
    error.statusCode = 400
    throw error
  }

  const scan = await runHtmlScanNow(prisma, { sheetId })

  // If scan failed but user has acknowledged the warning, allow submission
  // as pending_review for admin approval. Otherwise block.
  if (scan.status !== SCAN_STATUS.PASSED) {
    if (!sheet.htmlScanAcknowledgedAt) {
      const error = new Error('Security scan must pass before submit, or acknowledge the findings first.')
      error.statusCode = 409
      error.findings = scan.findings
      throw error
    }
    // User acknowledged — submit with flagged findings for admin review
  }

  return prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      status: 'pending_review',
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
  normalizeFindings,
  upsertHtmlVersion,
  runHtmlScanNow,
  scheduleHtmlScan,
  importHtmlDraft,
  updateWorkingHtmlDraft,
  getHtmlScanStatus,
  acknowledgeHtmlScanWarning,
  submitHtmlDraftForReview,
}
