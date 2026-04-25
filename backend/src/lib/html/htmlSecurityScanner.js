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
    features.push({
      category: 'validation',
      severity: 'high',
      message: 'HTML content cannot be empty.',
    })
  }
  if (value.length > MAX_HTML_CHARS) {
    features.push({
      category: 'validation',
      severity: 'high',
      message: `HTML content must be ${MAX_HTML_CHARS.toLocaleString()} characters or fewer.`,
    })
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
      message:
        'HTML contains inline event handlers (on*= attributes). These are allowed but flagged.',
    })
  }

  if (containsDangerousHrefOrSrc(lowered)) {
    features.push({
      category: 'dangerous-url',
      severity: 'medium',
      message:
        'HTML contains javascript:, vbscript:, or data: URLs. These are allowed but flagged.',
    })
  }

  return { features }
}

/**
 * Structural validation only: rejects empty or oversized HTML.
 * Feature detection (scripts, iframes, etc.) is handled by classifyHtmlRisk()
 * and does NOT block submission — those become scanner findings instead.
 */
function validateHtmlForSubmission(html) {
  const value = String(html || '')
  const issues = []

  if (!value.trim()) {
    issues.push('HTML content cannot be empty.')
  }
  if (value.length > MAX_HTML_CHARS) {
    issues.push(`HTML content must be ${MAX_HTML_CHARS.toLocaleString()} characters or fewer.`)
  }

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
  if (
    /\b(?:window\s*\.\s*)?location\s*\.\s*(?:href|replace|assign)\s*=/gi.test(value) ||
    /\bwindow\s*\.\s*location\s*=/gi.test(value)
  ) {
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
  const hasStorageOrNetwork =
    /\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon)\b/gi.test(value)
  if (hasKeyListener && hasStorageOrNetwork) {
    behaviors.push({
      category: 'keylogging',
      severity: 'high',
      message:
        'Keypress listener combined with storage or network API detected — possible keylogging.',
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
  if (
    /WebAssembly\s*\.\s*instantiate/gi.test(value) &&
    /\b(?:hash|nonce|mining|worker)\b/gi.test(value)
  ) {
    behaviors.push({
      category: 'crypto-miner',
      severity: 'high',
      message: 'WebAssembly instantiation combined with mining-related keywords detected.',
    })
  }

  // Credential capture: external form with password/sensitive inputs (critical)
  const hasExternalForm = /<form[^>]+action\s*=\s*["']?\s*https?:\/\//gi.test(value)
  const hasSensitiveInput =
    /<input[^>]+(?:type\s*=\s*["']?password|name\s*=\s*["']?(?:passw(?:or)?d|credit|card|ssn|cvv|pin|secret|token))\b/gi.test(
      value,
    )
  if (hasExternalForm && hasSensitiveInput) {
    behaviors.push({
      category: 'credential-capture',
      severity: 'critical',
      message:
        'External form with password or sensitive input fields detected — possible credential harvesting.',
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
 * Tier 3 (Quarantined): critical findings, 3+ distinct high-risk categories, or AV detection
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
  // Critical findings or 3+ distinct high-risk categories escalate to Tier 3.
  const hasBehaviors = behaviors.length > 0 || jsRisk.highRisk
  const hasFeatures = features.some((f) => f.category !== 'validation')
  const hasValidationOnly = features.length > 0 && !hasFeatures
  const hasCritical = findings.some((f) => f.severity === 'critical')

  // Count distinct high-severity behavior categories for combination escalation
  const highCategories = new Set()
  for (const b of behaviors) {
    if (b.severity === 'high' || b.severity === 'critical') highCategories.add(b.category)
  }
  // crypto-miner + obfuscation = coordinated malicious payload
  const hasMinerWithObfuscation =
    highCategories.has('crypto-miner') && highCategories.has('obfuscation')

  let tier = RISK_TIER.CLEAN
  if (hasCritical || highCategories.size >= 3 || hasMinerWithObfuscation) {
    tier = RISK_TIER.QUARANTINED
  } else if (hasBehaviors) {
    tier = RISK_TIER.HIGH_RISK
  } else if (hasFeatures) {
    tier = RISK_TIER.FLAGGED
  } else if (hasValidationOnly) {
    tier = RISK_TIER.FLAGGED
  }

  const summary =
    tier === RISK_TIER.CLEAN
      ? 'No suspicious patterns detected.'
      : `${TIER_LABELS[tier]}: ${findings.length} finding(s) detected.`

  return { tier, findings, summary }
}

/**
 * Human-readable labels for finding categories.
 */
const CATEGORY_LABELS = {
  validation: 'Structural Issues',
  'suspicious-tag': 'Suspicious Tags',
  'inline-handler': 'Inline Event Handlers',
  'dangerous-url': 'Dangerous URLs',
  obfuscation: 'Code Obfuscation',
  redirect: 'Page Redirects',
  exfiltration: 'Data Exfiltration',
  keylogging: 'Keylogging',
  'crypto-miner': 'Crypto Mining',
  'credential-capture': 'Credential Capture',
  'js-risk': 'Risky JavaScript',
  av: 'Antivirus Detection',
  system: 'System',
}

/**
 * Group an array of findings by category.
 * Works with both normalized findings (source field) and raw findings (category field).
 * Returns { [category]: { label, maxSeverity, findings[] } }
 */
function groupFindingsByCategory(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return {}

  const groups = {}
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }

  for (const f of findings) {
    const cat = f.category || f.source || 'unknown'
    if (!groups[cat]) {
      groups[cat] = {
        label: CATEGORY_LABELS[cat] || cat,
        maxSeverity: f.severity || 'medium',
        findings: [],
      }
    }
    groups[cat].findings.push(f)
    const current = severityOrder[groups[cat].maxSeverity] || 0
    const incoming = severityOrder[f.severity] || 0
    if (incoming > current) groups[cat].maxSeverity = f.severity
  }

  return groups
}

/**
 * Generate a short, plain-English summary of the risk findings.
 * Example: "Contains code obfuscation and page redirect behavior."
 */
function generateRiskSummary(tier, findings) {
  if (tier === RISK_TIER.CLEAN || !Array.isArray(findings) || findings.length === 0) {
    return 'No suspicious patterns detected.'
  }

  const categories = new Set()
  for (const f of findings) {
    const cat = f.category || f.source || 'unknown'
    if (cat !== 'validation' && cat !== 'system') categories.add(cat)
  }

  if (categories.size === 0) return 'Structural issues detected.'

  const SUMMARY_PHRASES = {
    'suspicious-tag': 'advanced HTML tags',
    'inline-handler': 'inline event handlers',
    'dangerous-url': 'suspicious URLs',
    obfuscation: 'obfuscated JavaScript',
    redirect: 'page redirect behavior',
    exfiltration: 'data exfiltration indicators',
    keylogging: 'keystroke capture patterns',
    'crypto-miner': 'crypto-mining signatures',
    'credential-capture': 'credential capture indicators',
    'js-risk': 'risky JavaScript patterns',
    av: 'antivirus-flagged content',
  }

  const phrases = []
  for (const cat of categories) {
    phrases.push(SUMMARY_PHRASES[cat] || cat)
  }

  if (phrases.length === 0) return `${findings.length} finding(s) detected.`
  if (phrases.length === 1) return `Contains ${phrases[0]}.`
  if (phrases.length === 2) return `Contains ${phrases[0]} and ${phrases[1]}.`
  const last = phrases.pop()
  return `Contains ${phrases.join(', ')}, and ${last}.`
}

/**
 * Generate a plain-English explanation of why a sheet was assigned a given tier.
 */
function generateTierExplanation(tier) {
  switch (tier) {
    case RISK_TIER.FLAGGED:
      return 'Flagged because the scanner detected advanced HTML features (scripts, iframes, or inline handlers). The sheet is published with a safe preview — scripts are disabled.'
    case RISK_TIER.HIGH_RISK:
      return 'Pending review because the scanner detected higher-risk behavior patterns (obfuscation, redirects, or data exfiltration). An admin must approve before the sheet is publicly visible.'
    case RISK_TIER.QUARANTINED:
      return 'Quarantined because the scanner detected a likely security threat (credential capture, coordinated malicious behavior, or antivirus detection). Preview is disabled.'
    default:
      return 'No issues detected. The sheet passed all security checks.'
  }
}

module.exports = {
  detectHtmlFeatures,
  validateHtmlForSubmission,
  detectHighRiskBehaviors,
  classifyHtmlRisk,
  groupFindingsByCategory,
  generateRiskSummary,
  generateTierExplanation,
  CATEGORY_LABELS,
}
