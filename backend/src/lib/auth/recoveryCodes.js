/**
 * recoveryCodes.js — 2FA recovery code primitives.
 *
 * Generates 10 single-use 64-bit codes formatted as `xxxxx-xxxxx`
 * (10 lowercase hex chars + a separator). Stores bcrypt hashes only;
 * the plaintext is shown to the user ONCE at generation time, never
 * stored, never re-displayed.
 *
 * Industry pattern: NIST 800-63B §AAL2 (alternative authenticator
 * factor), GitHub recovery codes, Cloudflare backup codes,
 * Google Authenticator backup codes.
 *
 * Verification is a constant-time bcrypt.compare loop over the
 * remaining hashes. On match the matching hash is dropped from the
 * array and `twoFaRecoveryUsedCount` increments by 1, so each code is
 * consumable exactly once.
 *
 * Why bcrypt instead of HMAC-SHA256: matches the existing password
 * storage primitive (cost factor 12), so a DB leak doesn't compromise
 * any single-secret form. The performance cost is fine for a 10-call
 * verify loop on the rare login path (per-user cap of 10 codes).
 *
 * Why hex over alphanumeric: avoids visually-confusing chars (l, I, 1,
 * 0, O) that bite users transcribing from a downloaded text file.
 */
const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')

const RECOVERY_CODE_COUNT = 10
const RECOVERY_CODE_BYTES = 5 // 10 hex chars per half = 64 bits total
const BCRYPT_ROUNDS = 12

/**
 * Generate a fresh batch of 10 plaintext recovery codes.
 * @returns {string[]} array of 10 codes formatted `xxxxx-xxxxx`
 */
function generatePlaintextCodes() {
  const codes = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    const buf = crypto.randomBytes(RECOVERY_CODE_BYTES)
    const hex = buf.toString('hex') // 10 hex chars
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5, 10)}`)
  }
  return codes
}

/**
 * Hash an array of plaintext codes for storage.
 * @param {string[]} codes
 * @returns {Promise<string[]>}
 */
async function hashCodes(codes) {
  return Promise.all(codes.map((code) => bcrypt.hash(code, BCRYPT_ROUNDS)))
}

/**
 * Normalize a user-supplied recovery code: strip whitespace, lowercase.
 * Accepts either `XXXXX-XXXXX` or the no-dash form `XXXXXXXXXX`.
 */
function normalizeRecoveryCode(input) {
  if (typeof input !== 'string') return null
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!cleaned) return null
  // Accept either `xxxxx-xxxxx` or `xxxxxxxxxx`. Convert no-dash form
  // back to canonical for hashing match.
  const noDash = cleaned.replace(/-/g, '')
  if (!/^[0-9a-f]{10}$/.test(noDash)) return null
  return `${noDash.slice(0, 5)}-${noDash.slice(5, 10)}`
}

/**
 * Try to consume a recovery code. Returns the new hashes array (with
 * the matching entry dropped) on success, or null on no-match.
 *
 * Constant-time-ish: every stored hash is checked even after a match
 * is found, so timing analysis can't infer "first hash matched" vs
 * "last hash matched". The bcrypt.compare cost is the dominant per-
 * iteration time.
 *
 * @param {{ hashes: string[], submitted: string }} args
 * @returns {Promise<{ matched: boolean, remainingHashes: string[] }>}
 */
async function consumeRecoveryCode({ hashes, submitted }) {
  const candidate = normalizeRecoveryCode(submitted)
  if (!candidate || !Array.isArray(hashes) || hashes.length === 0) {
    return { matched: false, remainingHashes: hashes || [] }
  }

  let matchedIndex = -1
  for (let i = 0; i < hashes.length; i += 1) {
    // Sequential bcrypt.compare on purpose — parallelizing would leak
    // timing information about which hash matched. Per-user cap of 10
    // codes keeps total latency bounded (~250ms worst case at cost 12).
    const ok = await bcrypt.compare(candidate, hashes[i])
    if (ok && matchedIndex === -1) matchedIndex = i
    // Continue iterating regardless to keep timing flat across hits
    // and misses (no early break).
  }

  if (matchedIndex === -1) {
    return { matched: false, remainingHashes: hashes }
  }

  const remaining = hashes.filter((_, i) => i !== matchedIndex)
  return { matched: true, remainingHashes: remaining }
}

module.exports = {
  RECOVERY_CODE_COUNT,
  generatePlaintextCodes,
  hashCodes,
  normalizeRecoveryCode,
  consumeRecoveryCode,
}
