/**
 * passwordSafety.js — Phase 5 password breach check using HIBP.
 *
 * Uses the k-anonymity model: hash the password with SHA-1, send only
 * the first 5 hex chars to the HIBP range API, then check the rest
 * locally. No plaintext or full hash ever leaves the server.
 *
 * Graceful degradation: if the API is unreachable, the check passes
 * silently so registration/password-change is never blocked by a
 * third-party outage.
 */
const crypto = require('node:crypto')

const HIBP_API = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 3000

/**
 * Check if a password has been seen in known data breaches.
 * Returns { breached: boolean, count: number }
 * count = 0 means not found (or API unreachable).
 */
async function checkPasswordBreach(password) {
  if (!password || typeof password !== 'string') {
    return { breached: false, count: 0 }
  }

  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(`${HIBP_API}${prefix}`, {
      headers: {
        'User-Agent': 'StudyHub-PasswordCheck/1.0',
        'Add-Padding': 'true', // HIBP padding to prevent fingerprinting
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) return { breached: false, count: 0 }

    const text = await response.text()
    const lines = text.split('\n')

    for (const line of lines) {
      const [hashSuffix, countStr] = line.split(':')
      if (hashSuffix.trim() === suffix) {
        const count = parseInt(countStr.trim(), 10) || 0
        return { breached: count > 0, count }
      }
    }

    return { breached: false, count: 0 }
  } catch {
    // API unreachable or timeout — degrade gracefully
    return { breached: false, count: 0 }
  }
}

module.exports = { checkPasswordBreach }
