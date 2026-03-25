const crypto = require('crypto')
const { GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms')
const { getKmsClient } = require('./kmsClient')

const ALG = 'aes-256-gcm'
const IV_BYTES = 12

/**
 * Encrypt plaintext using AWS KMS envelope encryption (AES-256-GCM).
 *
 * 1. Calls KMS GenerateDataKey to get a unique data key.
 * 2. Encrypts locally with AES-256-GCM using the plaintext data key.
 * 3. Returns only the ciphertext + the KMS-encrypted data key (never the plaintext key).
 */
async function encryptField(plaintext) {
  const keyArn = process.env.KMS_KEY_ARN
  if (!keyArn || !keyArn.startsWith('arn:aws:kms:')) throw new Error('KMS_KEY_ARN is not configured or invalid')

  const kms = getKmsClient()
  const { Plaintext, CiphertextBlob } = await kms.send(
    new GenerateDataKeyCommand({ KeyId: keyArn, KeySpec: 'AES_256' })
  )

  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALG, Buffer.from(Plaintext), iv)

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Zero out the plaintext key from memory as soon as possible
  Plaintext.fill(0)

  return {
    ciphertext: encrypted.toString('base64'),
    encryptedDataKey: Buffer.from(CiphertextBlob).toString('base64'),
    keyArn,
    alg: ALG,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    createdAt: new Date().toISOString(),
  }
}

/**
 * Decrypt an envelope-encrypted payload.
 *
 * 1. Calls KMS Decrypt to recover the plaintext data key from the encrypted blob.
 * 2. Uses the plaintext data key to decrypt locally with AES-256-GCM.
 */
async function decryptField(payload) {
  if (!payload || payload.encryptedDataKey == null || payload.ciphertext == null) {
    throw new Error('Invalid encrypted payload')
  }

  const kms = getKmsClient()
  const { Plaintext } = await kms.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(payload.encryptedDataKey, 'base64'),
    })
  )

  const decipher = crypto.createDecipheriv(
    payload.alg || ALG,
    Buffer.from(Plaintext),
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ])

  // Zero out the plaintext key from memory
  Plaintext.fill(0)

  return decrypted.toString('utf8')
}

module.exports = { encryptField, decryptField }
