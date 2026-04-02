/**
 * fieldEncryption.js -- AES-256-GCM field-level encryption for sensitive data.
 *
 * Encrypts individual database fields so that even with full database access,
 * sensitive data (emails, messages) remains unreadable without the encryption key.
 *
 * Ciphertext format: "v1:<iv-hex>:<ciphertext-hex>:<authTag-hex>"
 * The "v1" prefix enables future algorithm changes without breaking existing data.
 */

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits, recommended for GCM
const VERSION_PREFIX = 'v1'

/** Load encryption key from environment. Returns Buffer or null if not configured. */
function getKey(envVar = 'FIELD_ENCRYPTION_KEY') {
  const hex = process.env[envVar]
  if (!hex) return null
  if (hex.length !== 64) {
    throw new Error(`${envVar} must be a 64-character hex string (32 bytes). Got ${hex.length} chars.`)
  }
  return Buffer.from(hex, 'hex')
}

/** Cache keys to avoid repeated Buffer.from on every operation. */
let _currentKey = undefined
let _previousKey = undefined

function currentKey() {
  if (_currentKey === undefined) _currentKey = getKey('FIELD_ENCRYPTION_KEY')
  return _currentKey
}

function previousKey() {
  if (_previousKey === undefined) _previousKey = getKey('FIELD_ENCRYPTION_KEY_PREV')
  return _previousKey
}

/** Reset cached keys (useful for testing). */
function resetKeyCache() {
  _currentKey = undefined
  _previousKey = undefined
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} Ciphertext in format "v1:<iv>:<ciphertext>:<authTag>"
 */
function encrypt(plaintext) {
  const key = currentKey()
  if (!key) return plaintext // Encryption not configured -- pass through

  if (typeof plaintext !== 'string') return plaintext
  if (!plaintext) return plaintext

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return `${VERSION_PREFIX}:${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

/**
 * Decrypt a ciphertext string.
 * Tries the current key first, then the previous key (for rotation).
 * @param {string} ciphertext
 * @returns {string} Plaintext
 */
function decrypt(ciphertext) {
  if (typeof ciphertext !== 'string') return ciphertext
  if (!ciphertext) return ciphertext
  if (!isEncrypted(ciphertext)) return ciphertext // Plaintext pass-through

  const key = currentKey()
  if (!key) return ciphertext // Encryption not configured

  // Try current key first
  const result = decryptWithKey(ciphertext, key)
  if (result !== null) return result

  // Try previous key for rotation support
  const prevKey = previousKey()
  if (prevKey) {
    const prevResult = decryptWithKey(ciphertext, prevKey)
    if (prevResult !== null) return prevResult
  }

  // Both keys failed -- return ciphertext as-is to avoid data loss
  console.error('[fieldEncryption] Decryption failed with all available keys')
  return ciphertext
}

/**
 * Attempt decryption with a specific key.
 * @returns {string|null} Plaintext on success, null on failure.
 */
function decryptWithKey(ciphertext, key) {
  try {
    const parts = ciphertext.split(':')
    if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) return null

    const iv = Buffer.from(parts[1], 'hex')
    const encrypted = Buffer.from(parts[2], 'hex')
    const authTag = Buffer.from(parts[3], 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Check if a value looks like our encrypted format.
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (typeof value !== 'string') return false
  return value.startsWith(`${VERSION_PREFIX}:`) && value.split(':').length === 4
}

/**
 * Generate a SHA-256 hash of a value (for lookup columns like emailHash).
 * @param {string} value
 * @returns {string} Hex-encoded hash
 */
function hashForLookup(value) {
  if (typeof value !== 'string' || !value) return null
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

/**
 * Generate a new 32-byte encryption key as a hex string.
 * Use this to create FIELD_ENCRYPTION_KEY values.
 * @returns {string} 64-character hex string
 */
function generateKey() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Mask an email for display (e.g., "a***@gmail.com").
 * Works on both encrypted and plaintext emails.
 * @param {string} email - The email to mask (will be decrypted if encrypted).
 * @returns {string} Masked email
 */
function maskEmail(email) {
  const plain = decrypt(email)
  if (!plain || typeof plain !== 'string' || !plain.includes('@')) return '***@***'
  const [local, domain] = plain.split('@')
  if (local.length <= 1) return `${local}***@${domain}`
  return `${local[0]}***@${domain}`
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  hashForLookup,
  generateKey,
  maskEmail,
  resetKeyCache,
}
