const MAX_HTML_CHARS = 350_000

const FORBIDDEN_TAG_PATTERNS = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*meta\b/i,
  /<\s*base\b/i,
]

const FORBIDDEN_ATTRIBUTE_PATTERNS = [
  /\son[a-z]+\s*=/i,
  /(href|src)\s*=\s*["']?\s*javascript:/i,
  /(href|src)\s*=\s*["']?\s*data:\s*text\/html/i,
]

function normalizeContentFormat(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'html') return 'html'
  return 'markdown'
}

function validateHtmlForSubmission(html) {
  const value = String(html || '')
  const issues = []

  if (!value.trim()) {
    issues.push('HTML content cannot be empty.')
  }
  if (value.length > MAX_HTML_CHARS) {
    issues.push(`HTML content must be ${MAX_HTML_CHARS.toLocaleString()} characters or fewer.`)
  }

  for (const pattern of FORBIDDEN_TAG_PATTERNS) {
    if (pattern.test(value)) {
      issues.push('HTML includes a blocked tag. Remove script/iframe/object/embed/meta/base tags.')
      break
    }
  }

  for (const pattern of FORBIDDEN_ATTRIBUTE_PATTERNS) {
    if (pattern.test(value)) {
      issues.push('HTML includes blocked inline scripting. Remove inline handlers and javascript/data:text/html URLs.')
      break
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

module.exports = {
  normalizeContentFormat,
  validateHtmlForSubmission,
}
