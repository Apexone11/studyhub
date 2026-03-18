const MAX_HTML_CHARS = 350_000

const FORBIDDEN_TAG_NAMES = ['script', 'iframe', 'object', 'embed', 'meta', 'base']

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
  let result = ''
  for (let i = 0; i < value.length; i += 1) {
    if (!isAsciiWhitespace(value[i])) result += value[i]
  }
  return result
}

function containsForbiddenTag(value) {
  for (const tagName of FORBIDDEN_TAG_NAMES) {
    let cursor = 0

    while (cursor < value.length) {
      const openTagIndex = value.indexOf('<', cursor)
      if (openTagIndex === -1) break

      let tagStart = skipWhitespace(value, openTagIndex + 1)
      if (value[tagStart] === '/') tagStart = skipWhitespace(value, tagStart + 1)

      if (value.startsWith(tagName, tagStart)) {
        const boundary = value[tagStart + tagName.length]
        if (!isHtmlNameChar(boundary)) {
          return true
        }
      }

      cursor = openTagIndex + 1
    }
  }

  return false
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

function validateHtmlForSubmission(html) {
  const value = String(html || '')
  const lowered = value.toLowerCase()
  const issues = []

  if (!value.trim()) {
    issues.push('HTML content cannot be empty.')
  }
  if (value.length > MAX_HTML_CHARS) {
    issues.push(`HTML content must be ${MAX_HTML_CHARS.toLocaleString()} characters or fewer.`)
  }

  if (containsForbiddenTag(lowered)) {
    issues.push('HTML includes a blocked tag. Remove script/iframe/object/embed/meta/base tags.')
  }

  if (containsInlineEventHandler(lowered) || containsDangerousHrefOrSrc(lowered)) {
    issues.push('HTML includes blocked inline scripting. Remove inline handlers and javascript/vbscript/data URLs.')
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
