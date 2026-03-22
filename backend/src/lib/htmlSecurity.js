const MAX_HTML_CHARS = 350_000

const RISK_TIER = {
  CLEAN: 0,
  FLAGGED: 1,
  HIGH_RISK: 2,
  QUARANTINED: 3,
}

const TIER_LABELS = ['Clean', 'Flagged', 'High Risk', 'Quarantined']

// Tags that signal Tier 1 (suspicious but common in rich HTML)
const SUSPICIOUS_TAG_NAMES = ['script', 'iframe', 'object', 'embed', 'meta', 'base', 'form']

function isAsciiWhitespace(char) {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f'
}

function isAsciiLetter(char) {
  if (!char) return false
  const code = char.charCodeAt(0)
  return code >= 97 && code <= 122
}

function isHtmlNameChar(char) {
  if (!char) return false
  const code = char.charCodeAt(0)
  const isLetter = code >= 97 && code <= 122
  const isDigit = code >= 48 && code <= 57
  return isLetter || isDigit || char === '-' || char === '_' || char === ':'
}

function skipWhitespace(value, index) {
  let cursor = index
  while (cursor < value.length && isAsciiWhitespace(value[cursor])) cursor += 1
  return cursor
}

function stripAsciiWhitespace(value) {
  const resultChars = []
  for (let i = 0; i < value.length; i += 1) {
    if (!isAsciiWhitespace(value[i])) resultChars.push(value[i])
  }
  return resultChars.join('')
}

function containsSuspiciousTag(value) {
  const found = []
  for (const tagName of SUSPICIOUS_TAG_NAMES) {
    let cursor = 0

    while (cursor < value.length) {
      const openTagIndex = value.indexOf('<', cursor)
      if (openTagIndex === -1) break

      let tagStart = skipWhitespace(value, openTagIndex + 1)
      if (value[tagStart] === '/') tagStart = skipWhitespace(value, tagStart + 1)

      if (value.startsWith(tagName, tagStart)) {
        const boundary = value[tagStart + tagName.length]
        if (!isHtmlNameChar(boundary)) {
          found.push(tagName)
          break
        }
      }

      cursor = openTagIndex + 1
    }
  }

  return found
}

function containsInlineEventHandler(value) {
  for (let i = 0; i < value.length - 2; i += 1) {
    const previous = i > 0 ? value[i - 1] : ''
    if (previous && !isAsciiWhitespace(previous)) continue
    if (value[i] !== 'o' || value[i + 1] !== 'n') continue

    let cursor = i + 2
    let hasLetters = false
    while (cursor < value.length && isAsciiLetter(value[cursor])) {
      hasLetters = true
      cursor += 1
    }

    if (!hasLetters) continue

    cursor = skipWhitespace(value, cursor)
    if (value[cursor] === '=') {
      return true
    }
  }

  return false
}

function readAttributeValue(value, startIndex) {
  let cursor = skipWhitespace(value, startIndex)
  if (value[cursor] !== '=') return { value: '', nextIndex: cursor }

  cursor = skipWhitespace(value, cursor + 1)
  let quote = ''
  if (value[cursor] === '"' || value[cursor] === "'") {
    quote = value[cursor]
    cursor += 1
  }

  const valueStart = cursor
  while (cursor < value.length) {
    const char = value[cursor]
    if (quote) {
      if (char === quote) break
    } else if (isAsciiWhitespace(char) || char === '>') {
      break
    }
    cursor += 1
  }

  return {
    value: value.slice(valueStart, cursor),
    nextIndex: cursor + (quote && value[cursor] === quote ? 1 : 0),
  }
}

function containsDangerousHrefOrSrc(value) {
  const attributes = ['href', 'src']

  for (const attribute of attributes) {
    let cursor = 0

    while (cursor < value.length) {
      const index = value.indexOf(attribute, cursor)
      if (index === -1) break

      const previous = index > 0 ? value[index - 1] : ''
      const next = value[index + attribute.length] || ''
      const hasBoundaries = !isHtmlNameChar(previous) && !isHtmlNameChar(next)

      if (hasBoundaries) {
        const { value: rawValue, nextIndex } = readAttributeValue(value, index + attribute.length)
        if (rawValue) {
          const normalized = stripAsciiWhitespace(rawValue).trim().toLowerCase()
          if (
            normalized.startsWith('javascript:')
            || normalized.startsWith('vbscript:')
            || normalized.startsWith('data:')
          ) {
            return true
          }
        }
        cursor = Math.max(index + attribute.length, nextIndex)
        continue
      }

      cursor = index + attribute.length
    }
  }

  return false
}

function normalizeContentFormat(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'html') return 'html'
  return 'markdown'
}

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
 * Validate HTML for interactive runtime serving.
 * Rejects:
 *   - <script src="..."> (external script loading)
 *   - any http:// or https:// URLs in src, href, srcset attributes
 *   - CSS url() or @import with http/https
 *   - <base> tags (can redirect relative URLs)
 *   - <meta http-equiv="refresh"> (can redirect the page)
 * Allows:
 *   - inline <script>...</script> (CSP + sandbox protect execution)
 *   - inline styles
 *   - data: and blob: URLs
 */
function validateHtmlForRuntime(html) {
  const value = String(html || '')
  const lowered = value.toLowerCase()
  const issues = []

  // Reject <script src="...">
  const scriptSrcPattern = /<\s*script[^>]+\bsrc\s*=/gi
  if (scriptSrcPattern.test(value)) {
    issues.push('External scripts (<script src="...">) are not allowed. Use inline scripts only.')
  }

  // Reject <base> tags
  if (/<\s*base[\s>]/i.test(value)) {
    issues.push('<base> tags are not allowed.')
  }

  // Reject <meta http-equiv="refresh">
  if (/<\s*meta[^>]+http-equiv\s*=\s*["']?\s*refresh/i.test(value)) {
    issues.push('<meta http-equiv="refresh"> is not allowed.')
  }

  // Reject remote URLs (http/https) in src, href, srcset attributes
  const remoteAttrPattern = /\b(?:src|href|srcset)\s*=\s*["']?\s*https?:\/\//gi
  if (remoteAttrPattern.test(value)) {
    issues.push('Remote assets (http/https URLs in src, href, or srcset) are not allowed. Use inline content or data: URLs.')
  }

  // Reject remote URLs in CSS url() or @import
  const cssUrlPattern = /url\s*\(\s*["']?\s*https?:\/\//gi
  const cssImportPattern = /@import\s+["']?\s*https?:\/\//gi
  if (cssUrlPattern.test(lowered) || cssImportPattern.test(lowered)) {
    issues.push('Remote CSS assets (url() or @import with http/https) are not allowed.')
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

/**
 * Scan inline JS for high-risk patterns.
 * Returns { highRisk: boolean, flags: string[] }
 *
 * High risk = network attempt keywords OR eval/obfuscation patterns.
 * This runs at publish/submit time for reporting — it does NOT block.
 */
function scanInlineJsRisk(html) {
  const value = String(html || '')
  const flags = []

  // Network attempt keywords
  const networkPatterns = [
    { pattern: /\bfetch\s*\(/gi, label: 'fetch() call detected' },
    { pattern: /\bXMLHttpRequest\b/gi, label: 'XMLHttpRequest usage detected' },
    { pattern: /\bnew\s+WebSocket\b/gi, label: 'WebSocket usage detected' },
    { pattern: /\bnavigator\s*\.\s*sendBeacon\b/gi, label: 'sendBeacon() usage detected' },
    { pattern: /\bEventSource\b/gi, label: 'EventSource usage detected' },
    { pattern: /\bimportScripts\b/gi, label: 'importScripts() usage detected' },
  ]

  // Eval / obfuscation patterns
  const evalPatterns = [
    { pattern: /\beval\s*\(/gi, label: 'eval() call detected' },
    { pattern: /\bFunction\s*\(/gi, label: 'Function() constructor detected' },
    { pattern: /\bsetTimeout\s*\(\s*["'`]/gi, label: 'setTimeout() with string argument detected' },
    { pattern: /\bsetInterval\s*\(\s*["'`]/gi, label: 'setInterval() with string argument detected' },
    { pattern: /\batob\s*\(/gi, label: 'atob() (base64 decode) detected' },
    { pattern: /\\x[0-9a-f]{2}/gi, label: 'Hex-encoded string escape detected' },
    { pattern: /\\u00[0-9a-f]{2}/gi, label: 'Unicode escape obfuscation detected' },
    { pattern: /document\s*\.\s*cookie/gi, label: 'document.cookie access detected' },
    { pattern: /document\s*\.\s*domain/gi, label: 'document.domain access detected' },
  ]

  for (const { pattern, label } of networkPatterns) {
    if (pattern.test(value)) flags.push(label)
  }
  for (const { pattern, label } of evalPatterns) {
    if (pattern.test(value)) flags.push(label)
  }

  return {
    highRisk: flags.length > 0,
    flags,
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
 * Classify HTML content into a risk tier (0–3).
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
