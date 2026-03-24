const { classifyHtmlRisk, RISK_TIER } = require('./htmlSecurity')
const { scanBufferWithClamAv } = require('./clamav')
const {
  SCAN_STATUS,
  HTML_VERSION_KIND,
  findVersionByKind,
} = require('./htmlDraftStorage')

const scanTimers = new Map()

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
      category: finding.category || 'policy',
      severity: finding.severity || 'medium',
      message: finding.message,
    })
  }

  if (avResult) {
    if (avResult.status === 'infected') {
      findings.push({
        source: 'av',
        category: 'av',
        severity: 'critical',
        message: avResult.threat || 'Malicious payload detected by antivirus.',
      })
    } else if (avResult.status === 'error') {
      findings.push({
        source: 'av',
        category: 'av',
        severity: 'high',
        message: avResult.message || 'Antivirus scanner unavailable.',
      })
    }
  }

  return findings
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

module.exports = {
  normalizeFindings,
  runHtmlScanNow,
  scheduleHtmlScan,
}
