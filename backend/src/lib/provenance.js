const crypto = require('node:crypto')

/**
 * Provenance Manifest — AES-256-GCM encrypted origin tokens for study sheets.
 *
 * Each manifest cryptographically binds a sheet's content to its author at a
 * specific point in time. The encrypted token contains a JSON payload with the
 * sheet ID, user ID, SHA-256 content hash, creation timestamp, and format
 * version. Only the server can decrypt the token (using PROVENANCE_SECRET),
 * which allows admins to verify authorship and detect post-creation tampering.
 *
 * ── Tamper-detection cron (design notes) ──────────────────────────────────
 * A scheduled job (e.g. node-cron or a Railway cron service) would:
 *   1. Query all ProvenanceManifest records in batches (e.g. 100 at a time).
 *   2. For each manifest, load the related StudySheet.content.
 *   3. Call detectTampering(sheet, manifest) to compare the stored content
 *      hash inside the encrypted token against sha256(sheet.content).
 *   4. If tampered === true, flag the sheet for admin review (e.g. set a
 *      provenanceTampered boolean, create an admin notification, or write
 *      to an audit log table).
 *   5. Log summary metrics: total checked, tampered count, errors.
 *   6. Recommended frequency: once per hour in production; once per day in
 *      staging. The job should acquire a distributed lock (e.g. pg advisory
 *      lock) to avoid overlapping runs in multi-instance deployments.
 * ──────────────────────────────────────────────────────────────────────────
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const PROVENANCE_VERSION = '1.0'

/**
 * Derives the 32-byte encryption key from the PROVENANCE_SECRET env var.
 * In development, falls back to a deterministic key derived from a default
 * passphrase so the system works without explicit configuration.
 */
function getEncryptionKey() {
  const secret = process.env.PROVENANCE_SECRET
  if (secret) {
    // Expect a 64-char hex string (32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(secret)) {
      return Buffer.from(secret, 'hex')
    }
    // If not hex, derive a key from the secret via SHA-256
    return crypto.createHash('sha256').update(secret).digest()
  }

  // Dev fallback — deterministic but NOT suitable for production
  return crypto.createHash('sha256').update('studyhub-dev-provenance-key').digest()
}

/**
 * Creates a provenance manifest for a study sheet.
 *
 * @param {number} sheetId
 * @param {number} userId
 * @param {string} content - The sheet content to hash
 * @param {Date|string} createdAt - The sheet creation timestamp
 * @returns {{ originHash: string, encryptedToken: string, algorithm: string, iv: string, authTag: string }}
 */
function createProvenanceToken(sheetId, userId, content, createdAt) {
  const contentHash = crypto
    .createHash('sha256')
    .update(String(content))
    .digest('hex')

  const payload = JSON.stringify({
    sheetId,
    userId,
    contentHash,
    createdAt: new Date(createdAt).toISOString(),
    version: PROVENANCE_VERSION,
  })

  const originHash = crypto
    .createHash('sha256')
    .update(payload)
    .digest('hex')

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(payload, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag()

  return {
    originHash,
    encryptedToken: encrypted,
    algorithm: ALGORITHM,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  }
}

/**
 * Decrypts and verifies a provenance token.
 *
 * @param {string} encryptedToken - Base64-encoded ciphertext
 * @param {string} iv - Hex-encoded initialization vector
 * @param {string} authTag - Hex-encoded GCM authentication tag
 * @param {string} algorithm - Encryption algorithm (must be aes-256-gcm)
 * @returns {{ valid: boolean, payload: object|null, originHash: string|null }}
 */
function verifyProvenanceToken(encryptedToken, iv, authTag, algorithm) {
  try {
    if (algorithm !== ALGORITHM) {
      return { valid: false, payload: null, originHash: null }
    }

    const key = getEncryptionKey()
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'hex'),
    )
    decipher.setAuthTag(Buffer.from(authTag, 'hex'))

    let decrypted = decipher.update(encryptedToken, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    const payload = JSON.parse(decrypted)

    // Re-derive originHash and verify integrity
    const expectedOriginHash = crypto
      .createHash('sha256')
      .update(decrypted)
      .digest('hex')

    return {
      valid: true,
      payload,
      originHash: expectedOriginHash,
    }
  } catch {
    return { valid: false, payload: null, originHash: null }
  }
}

/**
 * Detects whether a sheet's current content differs from the content that
 * was hashed when the provenance manifest was created.
 *
 * @param {{ content: string }} sheet - The study sheet record (needs .content)
 * @param {{ encryptedToken: string, iv: string, authTag: string, algorithm: string }} manifest
 * @returns {{ tampered: boolean, details: object }}
 */
function detectTampering(sheet, manifest) {
  const result = verifyProvenanceToken(
    manifest.encryptedToken,
    manifest.iv,
    manifest.authTag,
    manifest.algorithm,
  )

  if (!result.valid) {
    return {
      tampered: true,
      details: {
        reason: 'decryption_failed',
        message: 'Could not decrypt or verify the provenance token.',
      },
    }
  }

  const currentContentHash = crypto
    .createHash('sha256')
    .update(String(sheet.content))
    .digest('hex')

  const originalContentHash = result.payload.contentHash
  const tampered = currentContentHash !== originalContentHash

  return {
    tampered,
    details: {
      reason: tampered ? 'content_mismatch' : 'none',
      originalContentHash,
      currentContentHash,
      sheetId: result.payload.sheetId,
      userId: result.payload.userId,
      provenanceCreatedAt: result.payload.createdAt,
      version: result.payload.version,
    },
  }
}

module.exports = {
  createProvenanceToken,
  verifyProvenanceToken,
  detectTampering,
  getEncryptionKey,
}
