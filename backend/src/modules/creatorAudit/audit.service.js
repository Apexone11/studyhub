const { classifyHtmlRisk } = require('../../lib/html/htmlSecurityScanner')
const { auditAssetOrigins } = require('../../lib/assetOriginPolicy')
const { detectPii } = require('../../lib/piiDetectors')
const { lintHtml } = require('../../lib/accessibilityLint')
const { detectCopyrightSignals } = require('../../lib/copyrightSignals')
const { captureError } = require('../../monitoring/sentry')
const {
  AUDIT_WEIGHTS,
  CHECK_TIMEOUT_MS,
  HTML_TIER_SCORES,
  MAX_AUDIT_REPORT_BYTES,
  gradeFromScore,
} = require('./creatorAudit.constants')

function piiScore(totalFindings) {
  if (totalFindings === 0) return 100
  if (totalFindings <= 3) return 80
  if (totalFindings <= 10) return 50
  return 20
}

function accessibilityScore(totalFailures) {
  if (totalFailures === 0) return 100
  if (totalFailures <= 2) return 80
  if (totalFailures <= 5) return 60
  return 30
}

function copyrightScore(signals) {
  const strongSignals = signals.filter((signal) => signal.strength === 'strong').length
  if (signals.length === 0) return 100
  if (strongSignals === 0) return 85
  if (strongSignals <= 2) return 60
  return 30
}

async function runWithTimeout(name, check, timeoutMs = CHECK_TIMEOUT_MS) {
  let timer
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      const error = new Error(`Creator audit check timed out: ${name}`)
      captureError(error, { context: 'creator-audit-timeout', check: name })
      resolve({ name, score: 70, timedOut: true, findings: [] })
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve().then(check), timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

function runHtmlCheck(contentHtml) {
  const htmlRisk = classifyHtmlRisk(contentHtml)
  return {
    name: 'html',
    score: HTML_TIER_SCORES[htmlRisk.tier] ?? 0,
    tier: htmlRisk.tier,
    summary: htmlRisk.summary,
    findings: htmlRisk.findings.map((finding) => ({ ...finding, check: 'html' })),
  }
}

function runAssetOriginCheck(contentHtml) {
  const result = auditAssetOrigins(contentHtml)
  return { name: 'assetOrigins', ...result }
}

function runPiiCheck(contentHtml) {
  const result = detectPii(contentHtml)
  const totalFindings = result.findings.length
  return {
    name: 'pii',
    score: piiScore(totalFindings),
    counts: result.counts,
    totalFindings,
    findings: result.findings.map((finding) => ({ ...finding, check: 'pii' })),
  }
}

function runAccessibilityCheck(contentHtml) {
  const result = lintHtml(contentHtml)
  return {
    name: 'accessibility',
    score: accessibilityScore(result.failures.length),
    failures: result.failures,
    findings: result.failures.map((failure) => ({ ...failure, check: 'accessibility' })),
  }
}

function runCopyrightCheck(contentHtml) {
  const result = detectCopyrightSignals(contentHtml)
  return {
    name: 'copyright',
    score: copyrightScore(result.signals),
    signals: result.signals,
    scoreDeduction: result.scoreDeduction,
    findings: result.signals.map((signal) => ({ ...signal, check: 'copyright' })),
  }
}

function publishDecisionFor({ grade, htmlTier }) {
  if (htmlTier === 3 || grade === 'F') return 'blocked'
  if (grade === 'D') return 'requires_acknowledgement'
  return 'allowed'
}

function normalizeSettledResult(result, fallbackName) {
  if (result.status === 'fulfilled') return result.value
  captureError(result.reason, { context: 'creator-audit-check', check: fallbackName })
  return {
    name: fallbackName,
    score: 70,
    errored: true,
    findings: [
      {
        check: fallbackName,
        severity: 'medium',
        message: 'This audit check could not complete. The score is estimated.',
      },
    ],
  }
}

function compactReport(report) {
  let serialized = JSON.stringify(report)
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_AUDIT_REPORT_BYTES) return report

  const compacted = {
    ...report,
    truncated: true,
    totalFindings: report.findings.length,
    findings: report.findings.slice(0, 100),
    checks: Object.fromEntries(
      Object.entries(report.checks).map(([name, check]) => [
        name,
        {
          ...check,
          findings: Array.isArray(check.findings) ? check.findings.slice(0, 50) : check.findings,
          failures: Array.isArray(check.failures) ? check.failures.slice(0, 50) : check.failures,
          signals: Array.isArray(check.signals) ? check.signals.slice(0, 50) : check.signals,
        },
      ]),
    ),
  }

  serialized = JSON.stringify(compacted)
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_AUDIT_REPORT_BYTES) return compacted

  return {
    ...compacted,
    checks: {},
    findings: compacted.findings.slice(0, 25),
  }
}

async function runAudit({ contentHtml, userId = null } = {}) {
  const value = String(contentHtml || '')
  const checkNames = ['html', 'assetOrigins', 'pii', 'accessibility', 'copyright']
  const settled = await Promise.allSettled([
    runWithTimeout('html', () => runHtmlCheck(value)),
    runWithTimeout('assetOrigins', () => runAssetOriginCheck(value)),
    runWithTimeout('pii', () => runPiiCheck(value)),
    runWithTimeout('accessibility', () => runAccessibilityCheck(value)),
    runWithTimeout('copyright', () => runCopyrightCheck(value)),
  ])
  const results = settled.map((result, index) => normalizeSettledResult(result, checkNames[index]))
  const checks = Object.fromEntries(results.map((result) => [result.name, result]))
  const overallScore = Math.round(
    Object.entries(AUDIT_WEIGHTS).reduce((total, [name, weight]) => {
      return total + (checks[name]?.score ?? 70) * weight
    }, 0),
  )
  const grade = gradeFromScore(overallScore)
  const findings = results.flatMap((result) => result.findings || [])
  const htmlTier = checks.html?.tier ?? 0

  return compactReport({
    version: 1,
    userId,
    generatedAt: new Date().toISOString(),
    overallScore,
    grade,
    publishDecision: publishDecisionFor({ grade, htmlTier }),
    htmlTier,
    checks,
    findings,
  })
}

module.exports = {
  accessibilityScore,
  compactReport,
  copyrightScore,
  piiScore,
  publishDecisionFor,
  runAudit,
  runWithTimeout,
}
