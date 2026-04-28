const CURRENT_CREATOR_RESPONSIBILITY_DOC_VERSION = '2026.04'
const CHECK_TIMEOUT_MS = 2500
const MAX_AUDIT_REPORT_BYTES = 50 * 1024

const AUDIT_WEIGHTS = Object.freeze({
  html: 0.4,
  assetOrigins: 0.15,
  pii: 0.2,
  accessibility: 0.15,
  copyright: 0.1,
})

const HTML_TIER_SCORES = Object.freeze({
  0: 100,
  1: 75,
  2: 40,
  3: 0,
})

function gradeFromScore(score) {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

module.exports = {
  AUDIT_WEIGHTS,
  CHECK_TIMEOUT_MS,
  CURRENT_CREATOR_RESPONSIBILITY_DOC_VERSION,
  HTML_TIER_SCORES,
  MAX_AUDIT_REPORT_BYTES,
  gradeFromScore,
}
