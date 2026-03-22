const {
  MAX_HTML_CHARS,
  RISK_TIER,
  TIER_LABELS,
  containsSuspiciousTag,
  containsInlineEventHandler,
  containsDangerousHrefOrSrc,
  scanInlineJsRisk,
} = require('./htmlSecurityRules')

/**
 * Detect HTML features that signal Tier 1 risk (suspicious but common).
 * Returns { features: [{category, severity, message}] }
 */
function detectHtmlFeatures(html) {
  const value = String(html || '')
  const lowered = value.toLowerCase()
  const features = []

  if (!value.trim()) {
    features.push({ category: 'validation', severity: 'high', message: 'HTML content cannot be empty.' })
  }
  if (value.length > MAX_HTML_CHARS) {
    features.push({ category: 'validation', severity: 'high', message: `HTML content must be ${MAX_HTML_CHARS.toLocaleString()} characters or fewer.` })
  }

  const suspiciousTags = containsSuspiciousTag(lowered)
  if (suspiciousTags.length > 0) {
    features.push({
      category: 'suspicious-tag',
      severity: 'medium',
      message: `HTML contains flagged tags: ${suspiciousTags.join(', ')}. These are allowed but will be flagged for review.`,
    })
  }

  if (containsInlineEventHandler(lowered)) {
    features.push({
      category: 'inline-handler',
      severity: 'medium',
      message: 'HTML contains inline event handlers (on*= attributes). These are allowed but flagged.',
    })
  }

  if (containsDangerousHrefOrSrc(lowered)) {
    features.push({
      category: 'dangerous-url',
      severity: 'medium',
      message: 'HTML contains javascript:, vbscript:, or data: URLs. These are allowed but flagged.',
    })
  }

  return { features }
}

/**
 * Backward-compatible wrapper: returns { ok, issues } like the old validateHtmlForSubmission.
 * @deprecated Use detectHtmlFeatures() or classifyHtmlRisk() instead.
 */
function validateHtmlForSubmission(html) {
  const { features } = detectHtmlFeatures(html)
  const issues = features.map((f) => f.message)
  return {
    ok: issues.length === 0,
    issues,
  }
}

/**
 * Detect Tier 2 behavioral patterns (high-risk behaviors, not just features).
 * Returns { behaviors: [{category, severity, message}] }
 */
function detectHighRiskBehaviors(html) {
  const value = String(html || '')
  const behaviors = []

  // Obfuscated JS: String.fromCharCode chains
  const fromCharCodeMatches = (value.match(/String\s*\.\s*fromCharCode/gi) || []).length
  if (fromCharCodeMatches >= 3) {
    behaviors.push({
      category: 'obfuscation',
      severity: 'high',
      message: `Heavy String.fromCharCode usage detected (${fromCharCodeMatches} occurrences) — possible obfuscation.`,
    })
  }

  // Obfuscated JS: heavy hex/unicode escaping (threshold: 10+ occurrences)
  const hexEscapes = (value.match(/\\x[0-9a-f]{2}/gi) || []).length
  const unicodeEscapes = (value.match(/\\u[0-9a-f]{4}/gi) || []).length
  if (hexEscapes + unicodeEscapes >= 10) {
    behaviors.push({
      category: 'obfuscation',
      severity: 'high',
      message: `Heavy character escaping detected (${hexEscapes} hex + ${unicodeEscapes} unicode) — possible obfuscation.`,
    })
  }

  // Hidden redirects: window.location manipulation
  if (/\b(?:window\s*\.\s*)?location\s*\.\s*(?:href|replace|assign)\s*=/gi.test(value)
    || /\bwindow\s*\.\s*location\s*=/gi.test(value)) {
    behaviors.push({
      category: 'redirect',
      severity: 'high',
      message: 'Page redirect detected (window.location assignment).',
    })
  }

  // Form exfiltration: <form> posting to external domains
  if (/<form[^>]+action\s*=\s*["']?\s*https?:\/\//gi.test(value)) {
    behaviors.push({
      category: 'exfiltration',
      severity: 'high',
      message: 'Form posts to external URL detected — possible data exfiltration.',
    })
  }

  // Keylogging: key event listeners combined with storage or network
  const hasKeyListener = /addEventListener\s*\(\s*["']key(?:down|press|up)["']/gi.test(value)
  const hasStorageOrNetwork = /\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon)\b/gi.test(value)
  if (hasKeyListener && hasStorageOrNetwork) {
    behaviors.push({
      category: 'keylogging',
      severity: 'high',
      message: 'Keypress listener combined with storage or network API detected — possible keylogging.',
    })
  }

  // Crypto-miner patterns
  if (/\b(?:CryptoNight|coinhive|coin-?hive|jsecoin)\b/gi.test(value)) {
    behaviors.push({
      category: 'crypto-miner',
      severity: 'high',
      message: 'Known crypto-miner signature detected.',
    })
  }
  if (/WebAssembly\s*\.\s*instantiate/gi.test(value) && /\b(?:hash|nonce|mining|worker)\b/gi.test(value)) {
    behaviors.push({
      category: 'crypto-miner',
      severity: 'high',
      message: 'WebAssembly instantiation combined with mining-related keywords detected.',
    })
  }

  return { behaviors }
}

/**
 * Classify HTML content into a risk tier (0-3).
 *
 * Tier 0 (Clean): no suspicious patterns
 * Tier 1 (Flagged): suspicious but common features (scripts, iframes, handlers)
 * Tier 2 (High Risk): behavioral patterns (obfuscation, redirects, keylogging, exfiltration)
 * Tier 3 (Quarantined): reserved for AV detection (set by workflow, not this function)
 *
 * Returns { tier, findings, summary }
 */
function classifyHtmlRisk(html) {
  const findings = []

  // Phase 1: detect Tier 1 features
  const { features } = detectHtmlFeatures(html)
  for (const feature of features) {
    findings.push(feature)
  }

  // Phase 2: detect Tier 2 behavioral patterns
  const { behaviors } = detectHighRiskBehaviors(html)
  for (const behavior of behaviors) {
    findings.push(behavior)
  }

  // Phase 3: inline JS risk scan (feeds into Tier 2)
  const jsRisk = scanInlineJsRisk(html)
  if (jsRisk.highRisk) {
    for (const flag of jsRisk.flags) {
      findings.push({
        category: 'js-risk',
        severity: 'high',
        message: flag,
      })
    }
  }

  // Determine tier: validation issues (empty/too-long) are Tier 1 since they
  // are not behavioral. Behavioral patterns elevate to Tier 2.
  const hasBehaviors = behaviors.length > 0 || jsRisk.highRisk
  const hasFeatures = features.some((f) => f.category !== 'validation')
  const hasValidationOnly = features.length > 0 && !hasFeatures

  let tier = RISK_TIER.CLEAN
  if (hasBehaviors) {
    tier = RISK_TIER.HIGH_RISK
  } else if (hasFeatures) {
    tier = RISK_TIER.FLAGGED
  } else if (hasValidationOnly) {
    tier = RISK_TIER.FLAGGED
  }

  const summary = tier === RISK_TIER.CLEAN
    ? 'No suspicious patterns detected.'
    : `${TIER_LABELS[tier]}: ${findings.length} finding(s) detected.`

  return { tier, findings, summary }
}

module.exports = {
  detectHtmlFeatures,
  validateHtmlForSubmission,
  detectHighRiskBehaviors,
  classifyHtmlRisk,
}
