import crypto from 'node:crypto'
import Module, { createRequire } from 'node:module'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

// ── Hoisted mocks ───────────────────────────────────────
const mocks = vi.hoisted(() => {
  const kmsClient = {
    send: vi.fn(),
  }

  return {
    kmsClient,
    getKmsClient: vi.fn(() => kmsClient),
    captureError: vi.fn(),
  }
})

// Generate test keys after crypto is available
const fakeDataKey = crypto.randomBytes(32)
const fakeEncryptedBlob = crypto.randomBytes(64)

// ── Module._load patching (must happen before require of kmsEnvelope) ──
const originalModuleLoad = Module._load

const mockTargets = new Map([
  [require.resolve('../src/lib/kms/kmsClient'), { getKmsClient: mocks.getKmsClient }],
  [require.resolve('../src/monitoring/sentry'), { captureError: mocks.captureError }],
])

// Patch immediately so the require below picks up mocks
process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-2:123456789012:key/test-key-id'
Module._load = function patchedModuleLoad(requestId, parent, isMain) {
  const resolved = Module._resolveFilename(requestId, parent, isMain)
  const mocked = mockTargets.get(resolved)
  if (mocked) return mocked
  return originalModuleLoad.apply(this, arguments)
}

const { encryptField, decryptField } = require('../src/lib/kms/kmsEnvelope')

afterAll(() => {
  Module._load = originalModuleLoad
  delete process.env.KMS_KEY_ARN
})

// ── Helpers ─────────────────────────────────────────────
function setupKmsMocks() {
  // GenerateDataKey returns a fresh copy each time (so .fill(0) doesn't corrupt our reference)
  mocks.kmsClient.send.mockImplementation((cmd) => {
    const cmdName = cmd.constructor.name
    if (cmdName === 'GenerateDataKeyCommand') {
      return Promise.resolve({
        Plaintext: Uint8Array.from(fakeDataKey),
        CiphertextBlob: Uint8Array.from(fakeEncryptedBlob),
      })
    }
    if (cmdName === 'DecryptCommand') {
      return Promise.resolve({
        Plaintext: Uint8Array.from(fakeDataKey),
      })
    }
    return Promise.reject(new Error(`Unexpected KMS command: ${cmdName}`))
  })
}

// ── Tests ───────────────────────────────────────────────
describe('kmsEnvelope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupKmsMocks()
  })

  describe('roundtrip encryption/decryption', () => {
    it('encrypts and decrypts a simple string', async () => {
      const plaintext = 'Hello, StudyHub!'
      const payload = await encryptField(plaintext)
      const result = await decryptField(payload)
      expect(result).toBe(plaintext)
    })

    it('encrypts and decrypts an empty string', async () => {
      const payload = await encryptField('')
      const result = await decryptField(payload)
      expect(result).toBe('')
    })

    it('encrypts and decrypts a JSON blob', async () => {
      const json = JSON.stringify({ email: 'test@example.com', phone: '555-1234' })
      const payload = await encryptField(json)
      const result = await decryptField(payload)
      expect(JSON.parse(result)).toEqual({ email: 'test@example.com', phone: '555-1234' })
    })

    it('encrypts and decrypts unicode content', async () => {
      const text = '日本語テスト 🎓📚'
      const payload = await encryptField(text)
      const result = await decryptField(payload)
      expect(result).toBe(text)
    })

    it('encrypts and decrypts a large string', async () => {
      const large = 'x'.repeat(100_000)
      const payload = await encryptField(large)
      const result = await decryptField(payload)
      expect(result).toBe(large)
    })
  })

  describe('payload structure', () => {
    it('returns all required envelope fields', async () => {
      const payload = await encryptField('test')
      expect(payload).toHaveProperty('ciphertext')
      expect(payload).toHaveProperty('encryptedDataKey')
      expect(payload).toHaveProperty('keyArn', process.env.KMS_KEY_ARN)
      expect(payload).toHaveProperty('alg', 'aes-256-gcm')
      expect(payload).toHaveProperty('iv')
      expect(payload).toHaveProperty('tag')
      expect(payload).toHaveProperty('createdAt')
    })

    it('all binary fields are base64-encoded strings', async () => {
      const payload = await encryptField('test')
      const b64Regex = /^[A-Za-z0-9+/]+=*$/
      expect(payload.ciphertext).toMatch(b64Regex)
      expect(payload.encryptedDataKey).toMatch(b64Regex)
      expect(payload.iv).toMatch(b64Regex)
      expect(payload.tag).toMatch(b64Regex)
    })

    it('produces unique IV per encryption', async () => {
      const p1 = await encryptField('same')
      const p2 = await encryptField('same')
      expect(p1.iv).not.toBe(p2.iv)
    })
  })

  describe('tampered ciphertext fails', () => {
    it('rejects tampered ciphertext', async () => {
      const payload = await encryptField('sensitive data')
      const buf = Buffer.from(payload.ciphertext, 'base64')
      buf[0] ^= 0xff // flip first byte
      payload.ciphertext = buf.toString('base64')
      await expect(decryptField(payload)).rejects.toThrow()
    })

    it('rejects tampered auth tag', async () => {
      const payload = await encryptField('sensitive data')
      const buf = Buffer.from(payload.tag, 'base64')
      buf[0] ^= 0xff
      payload.tag = buf.toString('base64')
      await expect(decryptField(payload)).rejects.toThrow()
    })

    it('rejects tampered IV', async () => {
      const payload = await encryptField('sensitive data')
      const buf = Buffer.from(payload.iv, 'base64')
      buf[0] ^= 0xff
      payload.iv = buf.toString('base64')
      await expect(decryptField(payload)).rejects.toThrow()
    })
  })

  describe('wrong key fails', () => {
    it('fails when KMS returns a different key for decryption', async () => {
      const payload = await encryptField('sensitive data')

      // Override decrypt to return a different key
      const wrongKey = crypto.randomBytes(32)
      mocks.kmsClient.send.mockImplementation((cmd) => {
        if (cmd.constructor.name === 'DecryptCommand') {
          return Promise.resolve({ Plaintext: Uint8Array.from(wrongKey) })
        }
        return Promise.reject(new Error('Unexpected'))
      })

      await expect(decryptField(payload)).rejects.toThrow()
    })
  })

  describe('error handling', () => {
    it('throws when KMS_KEY_ARN is not set', async () => {
      const saved = process.env.KMS_KEY_ARN
      delete process.env.KMS_KEY_ARN
      await expect(encryptField('test')).rejects.toThrow('KMS_KEY_ARN is not configured or invalid')
      process.env.KMS_KEY_ARN = saved
    })

    it('throws on invalid payload (missing fields)', async () => {
      await expect(decryptField(null)).rejects.toThrow('Invalid encrypted payload')
      await expect(decryptField({})).rejects.toThrow('Invalid encrypted payload')
      await expect(decryptField({ ciphertext: 'x' })).rejects.toThrow('Invalid encrypted payload')
    })

    it('propagates KMS errors without leaking key material', async () => {
      mocks.kmsClient.send.mockRejectedValue(new Error('AccessDeniedException'))
      await expect(encryptField('test')).rejects.toThrow('AccessDeniedException')
    })
  })
})
