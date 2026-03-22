/**
 * Re-export barrel — preserves all original exports for backwards compatibility.
 * Implementation split into:
 *   - ./htmlSecurityRules.js  (constants, patterns, allowlists, helpers, runtime/JS validators)
 *   - ./htmlSecurityScanner.js (feature detection, classification, submission validation)
 */
const {
  RISK_TIER,
  TIER_LABELS,
  normalizeContentFormat,
  validateHtmlForRuntime,
  scanInlineJsRisk,
} = require('./htmlSecurityRules')

const {
  detectHtmlFeatures,
  detectHighRiskBehaviors,
  classifyHtmlRisk,
  validateHtmlForSubmission,
} = require('./htmlSecurityScanner')

module.exports = {
  RISK_TIER,
  TIER_LABELS,
  normalizeContentFormat,
  detectHtmlFeatures,
  detectHighRiskBehaviors,
  classifyHtmlRisk,
  validateHtmlForSubmission,
  validateHtmlForRuntime,
  scanInlineJsRisk,
}
