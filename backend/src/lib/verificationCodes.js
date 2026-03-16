const crypto = require('crypto')

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function maskEmailAddress(email) {
  const normalizedEmail = String(email || '').trim()
  const [localPart, domain] = normalizedEmail.split('@')

  if (!localPart || !domain) return ''
  if (localPart.length <= 2) return `${localPart[0] || '*'}*@${domain}`

  return `${localPart.slice(0, 2)}${'*'.repeat(Math.max(localPart.length - 2, 1))}@${domain}`
}

module.exports = {
  generateSixDigitCode,
  maskEmailAddress,
}
