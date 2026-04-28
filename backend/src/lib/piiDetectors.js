const PII_PATTERNS = [
  {
    kind: 'email',
    regex: /\b[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+\b/gi,
  },
  {
    kind: 'phone_us',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  },
  {
    kind: 'phone_international',
    regex: /\+\d{1,3}\s?\d{4,14}/g,
  },
  {
    kind: 'student_id',
    regex: /(?:student\s*(?:id|#)|user\s*id)[:\s]\s*\d{7,10}/gi,
  },
  {
    kind: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
]

function luhnValid(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false

  let sum = 0
  let doubleDigit = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (doubleDigit) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    doubleDigit = !doubleDigit
  }

  return sum % 10 === 0
}

function creditCardCandidates(value) {
  const candidates = []
  let index = 0

  while (index < value.length) {
    if (!/\d/.test(value[index])) {
      index += 1
      continue
    }

    const start = index
    let end = index
    let digits = ''
    while (end < value.length && /[\d -]/.test(value[end]) && end - start <= 40) {
      if (/\d/.test(value[end])) digits += value[end]
      end += 1
    }

    if (digits.length >= 13 && digits.length <= 19) {
      candidates.push({ raw: value.slice(start, end), offsetStart: start, offsetEnd: end })
    }

    index = Math.max(end, index + 1)
  }

  return candidates
}

function addFinding(findings, counts, kind, offsetStart, offsetEnd) {
  findings.push({ kind, offsetStart, offsetEnd })
  counts[kind] = (counts[kind] || 0) + 1
}

function detectPii(text) {
  const value = String(text || '')
  const findings = []
  const counts = {}

  for (const { kind, regex } of PII_PATTERNS) {
    regex.lastIndex = 0
    for (const match of value.matchAll(regex)) {
      addFinding(findings, counts, kind, match.index, match.index + match[0].length)
    }
  }

  for (const candidate of creditCardCandidates(value)) {
    if (luhnValid(candidate.raw)) {
      addFinding(findings, counts, 'credit_card', candidate.offsetStart, candidate.offsetEnd)
    }
  }

  findings.sort((left, right) => left.offsetStart - right.offsetStart)

  return { findings, counts }
}

module.exports = { creditCardCandidates, detectPii, luhnValid }
