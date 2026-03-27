function isAsciiWhitespace(char) {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f'
}

function hasWhitespace(value) {
  for (let i = 0; i < value.length; i += 1) {
    if (isAsciiWhitespace(value[i])) return true
  }
  return false
}

function isValidDomainCharacter(char) {
  const code = char.charCodeAt(0)
  const isLower = code >= 97 && code <= 122
  const isUpper = code >= 65 && code <= 90
  const isDigit = code >= 48 && code <= 57
  return isLower || isUpper || isDigit || char === '.' || char === '-'
}

function isValidEmailAddress(value) {
  const email = String(value || '')

  if (email.length < 6 || email.length > 254) return false
  if (hasWhitespace(email)) return false

  const firstAt = email.indexOf('@')
  const lastAt = email.lastIndexOf('@')
  if (firstAt <= 0 || firstAt !== lastAt || firstAt === email.length - 1) return false

  const local = email.slice(0, firstAt)
  const domain = email.slice(firstAt + 1)

  if (!local || !domain) return false
  if (local.length > 64) return false
  if (domain.length < 3 || domain.length > 253) return false
  if (domain.startsWith('.') || domain.endsWith('.')) return false
  if (domain.includes('..')) return false

  const lastDot = domain.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === domain.length - 1) return false

  const topLevel = domain.slice(lastDot + 1)
  if (topLevel.length < 2) return false

  for (let i = 0; i < domain.length; i += 1) {
    if (!isValidDomainCharacter(domain[i])) return false
  }

  return true
}

module.exports = {
  isValidEmailAddress,
}
