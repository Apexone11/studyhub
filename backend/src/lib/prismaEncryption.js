/**
 * prismaEncryption.js -- Prisma middleware for transparent field encryption.
 *
 * Intercepts read/write operations on designated fields, encrypting on write
 * and decrypting on read. This ensures application code works with plaintext
 * while the database stores ciphertext.
 *
 * Usage:
 *   const prisma = require('./prisma')
 *   const { attachEncryptionMiddleware } = require('./prismaEncryption')
 *   attachEncryptionMiddleware(prisma)
 */

const { encrypt, decrypt, isEncrypted } = require('./fieldEncryption')

/**
 * Map of model names to arrays of encrypted field names.
 * Add new fields here as encryption coverage expands.
 */
const ENCRYPTED_FIELDS = {
  User: ['email'],
  Message: ['content'],
  AiMessage: ['content'],
}

/**
 * Recursively encrypt fields in a data object before writing.
 */
function encryptFields(modelName, data) {
  if (!data || typeof data !== 'object') return data
  const fields = ENCRYPTED_FIELDS[modelName]
  if (!fields) return data

  for (const field of fields) {
    if (field in data && typeof data[field] === 'string' && !isEncrypted(data[field])) {
      data[field] = encrypt(data[field])
    }
  }
  return data
}

/**
 * Recursively decrypt fields in a result object after reading.
 */
function decryptFields(modelName, result) {
  if (!result || typeof result !== 'object') return result

  const fields = ENCRYPTED_FIELDS[modelName]
  if (!fields) return result

  // Handle arrays (findMany results)
  if (Array.isArray(result)) {
    return result.map(item => decryptFields(modelName, item))
  }

  for (const field of fields) {
    if (field in result && typeof result[field] === 'string') {
      result[field] = decrypt(result[field])
    }
  }

  return result
}

/**
 * Decrypt fields in nested includes/relations.
 * Walks the result tree and decrypts any recognized model fields.
 */
function decryptNestedResults(result) {
  if (!result || typeof result !== 'object') return result

  if (Array.isArray(result)) {
    return result.map(item => decryptNestedResults(item))
  }

  // Check each key -- if it matches a known model relation, decrypt its fields
  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === 'object') {
      // Try to find a model match for this relation key
      const modelName = relationToModel(key)
      if (modelName && ENCRYPTED_FIELDS[modelName]) {
        if (Array.isArray(value)) {
          result[key] = value.map(item => {
            decryptFields(modelName, item)
            return decryptNestedResults(item)
          })
        } else {
          decryptFields(modelName, value)
          decryptNestedResults(value)
        }
      } else if (typeof value === 'object') {
        decryptNestedResults(value)
      }
    }
  }

  return result
}

/**
 * Map common Prisma relation names to model names.
 * This handles cases where encrypted models appear as nested includes.
 */
function relationToModel(relationName) {
  const map = {
    user: 'User',
    sender: 'User',
    recipient: 'User',
    creator: 'User',
    reviewer: 'User',
    reporter: 'User',
    claimer: 'User',
    author: 'User',
    sharedBy: 'User',
    sharedWith: 'User',
    participants: 'User',
    members: 'User',
    messages: 'Message',
    messagesSent: 'Message',
    aiMessages: 'AiMessage',
  }
  return map[relationName] || null
}

/**
 * Prisma operations that write data.
 */
const WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
])

/**
 * Prisma operations that read data.
 */
const READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'update',
  'upsert',
])

/**
 * Attach the encryption/decryption middleware to a Prisma client instance.
 * @param {import('@prisma/client').PrismaClient} prismaClient
 */
function attachEncryptionMiddleware(prismaClient) {
  // Skip if no encryption key is configured
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.log('[prismaEncryption] No FIELD_ENCRYPTION_KEY found -- encryption middleware disabled.')
    return
  }

  prismaClient.$use(async (params, next) => {
    const modelName = params.model

    // --- Encrypt on write ---
    if (modelName && ENCRYPTED_FIELDS[modelName] && WRITE_ACTIONS.has(params.action)) {
      if (params.args.data) {
        encryptFields(modelName, params.args.data)
      }
      // Handle upsert's create/update branches
      if (params.action === 'upsert') {
        if (params.args.create) encryptFields(modelName, params.args.create)
        if (params.args.update) encryptFields(modelName, params.args.update)
      }
      // Handle createMany's data array
      if (params.action === 'createMany' && Array.isArray(params.args.data)) {
        params.args.data.forEach(item => encryptFields(modelName, item))
      }
    }

    // Execute the query
    const result = await next(params)

    // --- Decrypt on read ---
    if (modelName && ENCRYPTED_FIELDS[modelName] && READ_ACTIONS.has(params.action) && result) {
      decryptFields(modelName, result)
    }

    // Decrypt nested relations regardless of root model
    if (result && typeof result === 'object') {
      decryptNestedResults(result)
    }

    return result
  })

  console.log('[prismaEncryption] Encryption middleware attached for models:', Object.keys(ENCRYPTED_FIELDS).join(', '))
}

module.exports = {
  attachEncryptionMiddleware,
  ENCRYPTED_FIELDS,
  // Exported for testing
  encryptFields,
  decryptFields,
}
