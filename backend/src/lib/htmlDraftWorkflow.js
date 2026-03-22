const crypto = require('node:crypto')
const { normalizeContentFormat, classifyHtmlRisk, RISK_TIER } = require('./htmlSecurity')
const { scanBufferWithClamAv } = require('./clamav')
const { sendHighRiskSheetAlert } = require('./email')
const { createNotification } = require('./notify')

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

/**
 * Map a risk tier to the corresponding scan status string.
 */
function tierToScanStatus(tier) {
  switch (tier) {
    case RISK_TIER.CLEAN: return SCAN_STATUS.PASSED
    case RISK_TIER.FLAGGED: return SCAN_STATUS.FLAGGED
    case RISK_TIER.HIGH_RISK: return SCAN_STATUS.PENDING_REVIEW
    case RISK_TIER.QUARANTINED: return SCAN_STATUS.QUARANTINED
    default: return SCAN_STATUS.PASSED
  }
}

/**
 * Build findings array from classifier output + AV result.
 */
function normalizeFindings(classifierResult, avResult) {
  const findings = []

  for (const finding of classifierResult.findings) {
    findings.push({
      source: finding.category || 'policy',
      severity: finding.severity || 'medium',
      message: finding.message,
    })
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

async function runHtmlScanNow(prisma, { sheetId }) {
  const sheet = await prisma.studySheet.findUnique({
    where: { id: sheetId },
    include: { htmlVersions: true, author: { select: { id: true, username: true } } },
  })

  if (!sheet || sheet.contentFormat !== 'html') {
    return {
      status: SCAN_STATUS.PASSED,
      tier: RISK_TIER.CLEAN,
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

  // Phase 1: classify risk tier
  const classifierResult = classifyHtmlRisk(htmlToScan)
  let tier = classifierResult.tier

  // Phase 2: always run ClamAV (regardless of classifier result)
  const avResult = await scanBufferWithClamAv(Buffer.from(htmlToScan, 'utf8'))

  // AV infected → escalate to Tier 3. AV error → log but don't escalate.
  if (avResult && avResult.status === 'infected') {
    tier = RISK_TIER.QUARANTINED
  }

  const findings = normalizeFindings(classifierResult, avResult)
  const scanStatus = tierToScanStatus(tier)

  await prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      htmlScanStatus: scanStatus,
      htmlRiskTier: tier,
      htmlScanFindings: findings,
      htmlScanUpdatedAt: new Date(),
      content: htmlToScan,
      // If sheet was pending_review but scan now shows clean + not acknowledged, revert to draft
      status: sheet.status === 'pending_review' && tier === RISK_TIER.CLEAN && !sheet.htmlScanAcknowledgedAt
        ? 'draft'
        : sheet.status,
    },
  })

  return {
    status: scanStatus,
    tier,
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
      htmlRiskTier: 0,
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
            htmlScanStatus: SCAN_STATUS.FLAGGED,
            htmlRiskTier: RISK_TIER.FLAGGED,
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
      htmlRiskTier: 0,
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
    tier: sheet.htmlRiskTier || 0,
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

  // Run scan and get tier
  const scan = await runHtmlScanNow(prisma, { sheetId })
  const tier = scan.tier

  // Route by tier
  let nextStatus
  switch (tier) {
    case RISK_TIER.CLEAN:
      // Tier 0: auto-publish
      nextStatus = 'published'
      break

    case RISK_TIER.FLAGGED:
      // Tier 1: auto-publish but require acknowledgement
      if (!sheet.htmlScanAcknowledgedAt) {
        const error = new Error('This sheet contains flagged HTML features. Acknowledge the findings before publishing.')
        error.statusCode = 409
        error.findings = scan.findings
        error.tier = tier
        throw error
      }
      nextStatus = 'published'
      break

    case RISK_TIER.HIGH_RISK:
      // Tier 2: pending admin review
      nextStatus = 'pending_review'
      break

    case RISK_TIER.QUARANTINED:
      // Tier 3: quarantined
      nextStatus = 'quarantined'
      break

    default:
      nextStatus = 'published'
  }

  // Notify admins for Tier 2+
  if (tier >= RISK_TIER.HIGH_RISK) {
    const username = sheet.author?.username || user.username || `User #${user.userId}`
    sendHighRiskSheetAlert({
      sheetId,
      sheetTitle: sheet.title,
      username,
      flags: scan.findings.map((f) => f.message),
    }).catch((err) => console.error('[htmlDraftWorkflow] Failed to send high-risk alert:', err.message))

    prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })
      .then((admins) => {
        for (const admin of admins) {
          createNotification(prisma, {
            userId: admin.id,
            type: 'moderation',
            message: `High-risk HTML sheet "${sheet.title || 'Untitled'}" submitted by ${username} — review required.`,
            actorId: user.userId,
            sheetId,
            linkPath: '/admin?tab=sheets',
          }).catch(() => {})
        }
      })
      .catch((err) => console.error('[htmlDraftWorkflow] Failed to notify admins:', err.message))
  }

  return prisma.studySheet.update({
    where: { id: sheetId },
    data: {
      status: nextStatus,
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
