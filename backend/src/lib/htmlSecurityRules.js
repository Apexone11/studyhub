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
 * Map a character index in a string to { line, column } (1-based).
 */
function indexToLineCol(value, index) {
  let line = 1
  let col = 1
  for (let i = 0; i < index && i < value.length; i += 1) {
    if (value[i] === '\n') { line += 1; col = 1 } else { col += 1 }
  }
  return { line, column: col }
}

/**
 * Extract a short snippet around an index (the full line, trimmed).
 */
function snippetAt(value, index) {
  let start = index
  while (start > 0 && value[start - 1] !== '\n') start -= 1
  let end = index
  while (end < value.length && value[end] !== '\n') end += 1
  const line = value.slice(start, end).trim()
  return line.length > 120 ? `${line.slice(0, 120)}…` : line
}

/**
 * Collect all regex matches with location metadata.
 */
function collectMatches(value, pattern, message, attribute) {
  const results = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match
  while ((match = regex.exec(value)) !== null) {
    const loc = indexToLineCol(value, match.index)
    const urlMatch = match[0].match(/https?:\/\/[^\s"'>)]+/)
    results.push({
      message,
      line: loc.line,
      column: loc.column,
      snippet: snippetAt(value, match.index),
      ...(attribute ? { attribute } : {}),
      ...(urlMatch ? { url: urlMatch[0] } : {}),
    })
  }
  return results
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
 *
 * Returns { ok, issues: string[], enrichedIssues: object[] }
 * enrichedIssues contain: { message, line, column, snippet, url?, attribute? }
 */
function validateHtmlForRuntime(html) {
  const value = String(html || '')
  const lowered = value.toLowerCase()
  const issues = []
  const enrichedIssues = []

  // Reject <script src="...">
  const scriptSrcMatches = collectMatches(value, /<\s*script[^>]+\bsrc\s*=/gi, 'External script — use inline scripts only.', 'src')
  if (scriptSrcMatches.length > 0) {
    issues.push('External scripts (<script src="...">) are not allowed. Use inline scripts only.')
    enrichedIssues.push(...scriptSrcMatches)
  }

  // Reject <base> tags
  const baseMatches = collectMatches(value, /<\s*base[\s>]/gi, '<base> tag is not allowed.')
  if (baseMatches.length > 0) {
    issues.push('<base> tags are not allowed.')
    enrichedIssues.push(...baseMatches)
  }

  // Reject <meta http-equiv="refresh">
  const metaRefreshMatches = collectMatches(value, /<\s*meta[^>]+http-equiv\s*=\s*["']?\s*refresh/gi, '<meta http-equiv="refresh"> is not allowed.')
  if (metaRefreshMatches.length > 0) {
    issues.push('<meta http-equiv="refresh"> is not allowed.')
    enrichedIssues.push(...metaRefreshMatches)
  }

  // Reject remote URLs (http/https) in src, href, srcset attributes
  const remoteAttrMatches = collectMatches(value, /\b(?:src|href|srcset)\s*=\s*["']?\s*https?:\/\//gi, 'Remote asset — use inline content or data: URLs.', 'src/href/srcset')
  if (remoteAttrMatches.length > 0) {
    issues.push('Remote assets (http/https URLs in src, href, or srcset) are not allowed. Use inline content or data: URLs.')
    enrichedIssues.push(...remoteAttrMatches)
  }

  // Reject remote URLs in CSS url() or @import
  const cssUrlMatches = collectMatches(lowered, /url\s*\(\s*["']?\s*https?:\/\//gi, 'Remote CSS url() — use inline styles or data: URLs.', 'css')
  const cssImportMatches = collectMatches(lowered, /@import\s+["']?\s*https?:\/\//gi, 'Remote @import — use inline styles.', 'css')
  if (cssUrlMatches.length > 0 || cssImportMatches.length > 0) {
    issues.push('Remote CSS assets (url() or @import with http/https) are not allowed.')
    enrichedIssues.push(...cssUrlMatches, ...cssImportMatches)
  }

  return {
    ok: issues.length === 0,
    issues,
    enrichedIssues,
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

module.exports = {
  MAX_HTML_CHARS,
  RISK_TIER,
  TIER_LABELS,
  SUSPICIOUS_TAG_NAMES,
  normalizeContentFormat,
  containsSuspiciousTag,
  containsInlineEventHandler,
  containsDangerousHrefOrSrc,
  validateHtmlForRuntime,
  scanInlineJsRisk,
  indexToLineCol,
}
