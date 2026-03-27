const prisma = require('./prisma')
const { encryptField, decryptField } = require('./kms/kmsEnvelope')
const { recordAudit } = require('./auditLog')

const REJECTED_FIELDS = new Set(['address', 'streetAddress', 'mailingAddress', 'homeAddress', 'billingAddress', 'shippingAddress', 'physicalAddress'])

/**
 * Strips address-related fields from the input object.
 * StudyHub explicitly does not collect physical addresses.
 */
function stripAddressFields(obj, depth = 0) {
  if (depth > 5 || typeof obj !== 'object' || obj === null) return obj
  const cleaned = {}
  for (const [key, value] of Object.entries(obj)) {
    if (REJECTED_FIELDS.has(key)) continue
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      cleaned[key] = stripAddressFields(value, depth + 1)
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Store encrypted PII for a user.
 * Replaces any existing vault record (upsert).
 *
 * @param {number} userId
 * @param {object} data - JSON-serialisable object (address fields are stripped)
 * @param {object} [actor] - Actor context for audit logging
 * @param {number} [actor.id] - Actor user ID
 * @param {string} [actor.role] - Actor role
 * @param {string} [actor.route] - Request route
 * @param {string} [actor.method] - HTTP method
 * @returns {object} The created/updated UserSensitive record (no plaintext)
 */
async function setUserPII(userId, data, actor = {}) {
  const cleaned = stripAddressFields(data)
  const json = JSON.stringify(cleaned)
  const envelope = await encryptField(json)

  const result = await prisma.userSensitive.upsert({
    where: { userId },
    create: {
      userId,
      ciphertext: `${envelope.alg}:${envelope.iv}:${envelope.tag}:${envelope.ciphertext}`,
      encryptedDataKey: envelope.encryptedDataKey,
      keyArn: envelope.keyArn,
    },
    update: {
      ciphertext: `${envelope.alg}:${envelope.iv}:${envelope.tag}:${envelope.ciphertext}`,
      encryptedDataKey: envelope.encryptedDataKey,
      keyArn: envelope.keyArn,
    },
  })

  recordAudit({
    event: 'pii.write',
    actorId: actor.id || null,
    actorRole: actor.role || null,
    targetUserId: userId,
    route: actor.route || null,
    method: actor.method || null,
  }).catch(() => {}) // audit failures must not block the operation

  return result
}

/**
 * Retrieve and decrypt PII for a user.
 *
 * @param {number} userId
 * @param {object} [actor] - Actor context for audit logging
 * @param {number} [actor.id] - Actor user ID
 * @param {string} [actor.role] - Actor role
 * @param {string} [actor.route] - Request route
 * @param {string} [actor.method] - HTTP method
 * @returns {object|null} Decrypted JSON object, or null if no vault record exists
 */
async function getUserPII(userId, actor = {}) {
  const record = await prisma.userSensitive.findUnique({ where: { userId } })
  if (!record) return null

  // Parse the packed ciphertext format: alg:iv:tag:ciphertext
  const parts = record.ciphertext.split(':')
  if (parts.length !== 4) throw new Error('Corrupted PII vault record')
  const [alg, iv, tag, ciphertext] = parts

  const plaintext = await decryptField({
    ciphertext,
    encryptedDataKey: record.encryptedDataKey,
    keyArn: record.keyArn,
    alg,
    iv,
    tag,
  })

  let data
  try {
    data = JSON.parse(plaintext)
  } catch {
    throw new Error('Corrupted PII vault data')
  }

  recordAudit({
    event: 'pii.read',
    actorId: actor.id || null,
    actorRole: actor.role || null,
    targetUserId: userId,
    route: actor.route || null,
    method: actor.method || null,
  }).catch(() => {}) // audit failures must not block the operation

  return data
}

module.exports = { setUserPII, getUserPII, stripAddressFields, REJECTED_FIELDS }
