#!/usr/bin/env node
/**
 * encryptExistingData.js -- One-time migration script to encrypt existing
 * plaintext fields and backfill emailHash values.
 *
 * USAGE:
 *   FIELD_ENCRYPTION_KEY=<64-char-hex> node backend/scripts/encryptExistingData.js
 *
 * This script is idempotent: it skips values that are already encrypted.
 * Run it after deploying the encryption middleware and migration.
 */

const { PrismaClient } = require('@prisma/client')
const { encrypt, isEncrypted, hashForLookup } = require('../src/lib/fieldEncryption')

// Use a raw PrismaClient WITHOUT the encryption middleware
// so we can read plaintext and write ciphertext directly.
const prisma = new PrismaClient()

const BATCH_SIZE = 500

async function encryptUserEmails() {
  console.log('[encrypt] Starting User.email encryption + emailHash backfill...')
  let processed = 0
  let encrypted = 0
  let skip = 0

  while (true) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, emailHash: true },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    })

    if (users.length === 0) break

    for (const user of users) {
      const updates = {}

      // Encrypt email if it exists and is not already encrypted
      if (user.email && !isEncrypted(user.email)) {
        updates.email = encrypt(user.email)
        encrypted++
      }

      // Backfill emailHash if missing
      if (user.email && !user.emailHash) {
        // Use the plaintext email (before encryption) for the hash
        const plainEmail = isEncrypted(user.email) ? user.email : user.email
        // If already encrypted, we cannot hash it -- skip
        // (This case should not happen on first run)
        if (!isEncrypted(user.email)) {
          updates.emailHash = hashForLookup(user.email)
        }
      }

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updates,
        })
      }

      processed++
    }

    skip += BATCH_SIZE
    console.log(`[encrypt]   Processed ${processed} users (${encrypted} emails encrypted)`)
  }

  console.log(`[encrypt] User.email: ${processed} processed, ${encrypted} encrypted.`)
}

async function encryptMessages() {
  console.log('[encrypt] Starting Message.content encryption...')
  let processed = 0
  let encrypted = 0
  let skip = 0

  while (true) {
    const messages = await prisma.message.findMany({
      select: { id: true, content: true },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    })

    if (messages.length === 0) break

    for (const msg of messages) {
      if (msg.content && !isEncrypted(msg.content)) {
        await prisma.message.update({
          where: { id: msg.id },
          data: { content: encrypt(msg.content) },
        })
        encrypted++
      }
      processed++
    }

    skip += BATCH_SIZE
    console.log(`[encrypt]   Processed ${processed} messages (${encrypted} encrypted)`)
  }

  console.log(`[encrypt] Message.content: ${processed} processed, ${encrypted} encrypted.`)
}

async function encryptAiMessages() {
  console.log('[encrypt] Starting AiMessage.content encryption...')
  let processed = 0
  let encrypted = 0
  let skip = 0

  while (true) {
    const messages = await prisma.aiMessage.findMany({
      select: { id: true, content: true },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    })

    if (messages.length === 0) break

    for (const msg of messages) {
      if (msg.content && !isEncrypted(msg.content)) {
        await prisma.aiMessage.update({
          where: { id: msg.id },
          data: { content: encrypt(msg.content) },
        })
        encrypted++
      }
      processed++
    }

    skip += BATCH_SIZE
    console.log(`[encrypt]   Processed ${processed} AI messages (${encrypted} encrypted)`)
  }

  console.log(`[encrypt] AiMessage.content: ${processed} processed, ${encrypted} encrypted.`)
}

async function main() {
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.error('[encrypt] ERROR: FIELD_ENCRYPTION_KEY environment variable is not set.')
    console.error('[encrypt] Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    process.exit(1)
  }

  console.log('[encrypt] Starting data encryption migration...')
  console.log(`[encrypt] Batch size: ${BATCH_SIZE}`)

  try {
    await encryptUserEmails()
    await encryptMessages()
    await encryptAiMessages()
    console.log('[encrypt] Migration complete.')
  } catch (err) {
    console.error('[encrypt] Migration failed:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
