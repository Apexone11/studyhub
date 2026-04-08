/**
 * HTML draft workflow — orchestration layer and re-export barrel.
 *
 * Implementation split into:
 *   ./htmlDraftStorage.js    — constants, checksums, DB helpers
 *   ./htmlDraftValidation.js — scan logic, tier mapping, findings
 */

const { RISK_TIER, generateRiskSummary, generateTierExplanation, groupFindingsByCategory } = require('./htmlSecurity')
const { sendHighRiskSheetAlert } = require('./email')
const { createNotification } = require('./notify')

const {
  SCAN_STATUS,
  HTML_VERSION_KIND,
  computeHtmlChecksum,
  normalizeTitle,
  normalizeDescription,
  findVersionByKind,
  upsertHtmlVersion,
  ensureSheetOwnership,
  upsertDraftSheet,
} = require('./htmlDraftStorage')

const {
  normalizeFindings,
  runHtmlScanNow,
  scheduleHtmlScan,
} = require('./htmlDraftValidation')

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

  const tier = sheet.htmlRiskTier || 0
  const findings = Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : []

  return {
    status: sheet.htmlScanStatus || SCAN_STATUS.QUEUED,
    tier,
    findings,
    riskSummary: generateRiskSummary(tier, findings),
    tierExplanation: generateTierExplanation(tier),
    findingsByCategory: groupFindingsByCategory(findings),
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
            priority: 'high',
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
  // Re-exported from htmlDraftStorage
  SCAN_STATUS,
  HTML_VERSION_KIND,
  computeHtmlChecksum,
  upsertHtmlVersion,
  // Re-exported from htmlDraftValidation
  normalizeFindings,
  runHtmlScanNow,
  scheduleHtmlScan,
  // Workflow orchestration (defined in this file)
  importHtmlDraft,
  updateWorkingHtmlDraft,
  getHtmlScanStatus,
  acknowledgeHtmlScanWarning,
  submitHtmlDraftForReview,
}
