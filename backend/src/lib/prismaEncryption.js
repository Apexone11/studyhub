/**
 * prismaEncryption.js -- Prisma extension for transparent field encryption.
 *
 * Uses Prisma 6.x $extends API (replaces the removed $use middleware).
 * Intercepts read/write operations on designated fields, encrypting on write
 * and decrypting on read. This ensures application code works with plaintext
 * while the database stores ciphertext.
 *
 * Usage:
 *   const { PrismaClient } = require('@prisma/client')
 *   const { withEncryption } = require('./prismaEncryption')
 *   const prisma = withEncryption(new PrismaClient())
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
 * Lowercase model name -> config key mapping.
 * Prisma $allOperations gives us the lowercase model name.
 */
const MODEL_LOOKUP = {}
for (const key of Object.keys(ENCRYPTED_FIELDS)) {
  MODEL_LOOKUP[key.charAt(0).toLowerCase() + key.slice(1)] = key
}

/**
 * Encrypt designated fields in a data object before writing.
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
 * Decrypt designated fields in a result object after reading.
 */
function decryptFields(modelName, result) {
  if (!result || typeof result !== 'object') return result

  const fields = ENCRYPTED_FIELDS[modelName]
  if (!fields) return result

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
 * Map common Prisma relation names to model names.
 * Handles cases where encrypted models appear as nested includes.
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
 * Decrypt fields in nested includes/relations.
 * Walks the result tree and decrypts any recognized model fields.
 */
function decryptNestedResults(result) {
  if (!result || typeof result !== 'object') return result

  if (Array.isArray(result)) {
    return result.map(item => decryptNestedResults(item))
  }

  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === 'object') {
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

/** Prisma operations that write data. */
const WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
])

/** Prisma operations that return readable results. */
const READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createManyAndReturn',
  'update',
  'upsert',
])

/**
 * Wrap a PrismaClient with transparent field encryption via $extends.
 * Returns the extended client (or the original if no key is configured).
 *
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @returns {import('@prisma/client').PrismaClient}
 */
function withEncryption(prismaClient) {
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.log('[prismaEncryption] No FIELD_ENCRYPTION_KEY found -- encryption disabled.')
    return prismaClient
  }

  const extended = prismaClient.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        const modelName = model ? MODEL_LOOKUP[model] || null : null

        // --- Encrypt on write ---
        if (modelName && ENCRYPTED_FIELDS[modelName] && WRITE_ACTIONS.has(operation)) {
          if (args.data) {
            encryptFields(modelName, args.data)
          }
          if (operation === 'upsert') {
            if (args.create) encryptFields(modelName, args.create)
            if (args.update) encryptFields(modelName, args.update)
          }
          if (operation === 'createMany' && Array.isArray(args.data)) {
            args.data.forEach(item => encryptFields(modelName, item))
          }
        }

        // Execute the query, then decrypt results
        return query(args).then(result => {
          if (modelName && ENCRYPTED_FIELDS[modelName] && READ_ACTIONS.has(operation) && result) {
            decryptFields(modelName, result)
          }
          if (result && typeof result === 'object') {
            decryptNestedResults(result)
          }
          return result
        })
      },
    },
  })

  console.log('[prismaEncryption] Encryption extension attached for models:', Object.keys(ENCRYPTED_FIELDS).join(', '))
  return extended
}

module.exports = {
  withEncryption,
  ENCRYPTED_FIELDS,
  // Exported for testing
  encryptFields,
  decryptFields,
}
