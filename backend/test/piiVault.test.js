import crypto from 'node:crypto'
import Module, { createRequire } from 'node:module'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

// ── Hoisted mocks ───────────────────────────────────────
const mocks = vi.hoisted(() => {
  const kmsClient = { send: vi.fn() }

  return {
    kmsClient,
    getKmsClient: vi.fn(() => kmsClient),
    prisma: {
      userSensitive: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
      },
    },
  }
})

// Generate stable test key
const fakeDataKey = crypto.randomBytes(32)
const fakeEncryptedBlob = crypto.randomBytes(64)

// ── Module._load patching (before any require of target modules) ──
const originalModuleLoad = Module._load

const mockTargets = new Map([
  [require.resolve('../src/lib/kms/kmsClient'), { getKmsClient: mocks.getKmsClient }],
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), { captureError: vi.fn() }],
])

process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-2:123456789012:key/test-key-id'
Module._load = function patchedModuleLoad(requestId, parent, isMain) {
  const resolved = Module._resolveFilename(requestId, parent, isMain)
  const mocked = mockTargets.get(resolved)
  if (mocked) return mocked
  return originalModuleLoad.apply(this, arguments)
}

const { setUserPII, getUserPII, stripAddressFields, REJECTED_FIELDS } = require('../src/lib/piiVault')

afterAll(() => {
  Module._load = originalModuleLoad
  delete process.env.KMS_KEY_ARN
})

// ── KMS mock setup ──────────────────────────────────────
function setupKmsMocks() {
  mocks.kmsClient.send.mockImplementation((cmd) => {
    const name = cmd.constructor.name
    if (name === 'GenerateDataKeyCommand') {
      return Promise.resolve({
        Plaintext: Uint8Array.from(fakeDataKey),
        CiphertextBlob: Uint8Array.from(fakeEncryptedBlob),
      })
    }
    if (name === 'DecryptCommand') {
      return Promise.resolve({
        Plaintext: Uint8Array.from(fakeDataKey),
      })
    }
    return Promise.reject(new Error(`Unexpected: ${name}`))
  })
}

// ── Tests ───────────────────────────────────────────────
describe('piiVault', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupKmsMocks()
  })

  describe('stripAddressFields', () => {
    it('removes all address-related fields', () => {
      const input = {
        email: 'test@example.com',
        phone: '555-1234',
        address: '123 Main St',
        streetAddress: '456 Oak Ave',
        homeAddress: '789 Elm St',
      }
      const result = stripAddressFields(input)
      expect(result).toEqual({ email: 'test@example.com', phone: '555-1234' })
    })

    it('passes through objects without address fields unchanged', () => {
      const input = { email: 'a@b.com', phone: '555' }
      expect(stripAddressFields(input)).toEqual(input)
    })

    it('rejects all known address field names', () => {
      for (const field of REJECTED_FIELDS) {
        const result = stripAddressFields({ [field]: 'value', keep: true })
        expect(result).toEqual({ keep: true })
      }
    })

    it('strips nested address fields deeply', () => {
      const input = {
        email: 'a@b.com',
        profile: { homeAddress: '123 Main St', city: 'NYC' },
        contact: { emergency: { address: '456 Oak Ave', phone: '555' } },
      }
      const result = stripAddressFields(input)
      expect(result.profile.homeAddress).toBeUndefined()
      expect(result.profile.city).toBe('NYC')
      expect(result.contact.emergency.address).toBeUndefined()
      expect(result.contact.emergency.phone).toBe('555')
    })
  })

  describe('setUserPII', () => {
    it('encrypts data and upserts a vault record', async () => {
      mocks.prisma.userSensitive.upsert.mockResolvedValue({ id: 1, userId: 42 })

      const result = await setUserPII(42, { email: 'secret@example.com', phone: '555-9999' })

      expect(mocks.prisma.userSensitive.upsert).toHaveBeenCalledOnce()
      const call = mocks.prisma.userSensitive.upsert.mock.calls[0][0]
      expect(call.where).toEqual({ userId: 42 })
      expect(call.create.userId).toBe(42)
      expect(call.create.ciphertext).toContain('aes-256-gcm:')
      expect(call.create.encryptedDataKey).toBeTruthy()
      expect(call.create.keyArn).toBe(process.env.KMS_KEY_ARN)
      expect(result).toEqual({ id: 1, userId: 42 })
    })

    it('strips address fields before encryption', async () => {
      mocks.prisma.userSensitive.upsert.mockResolvedValue({ id: 1, userId: 42 })

      await setUserPII(42, { email: 'a@b.com', address: '123 Main St' })

      // Verify KMS was called (encryption happened), and the data was stored
      expect(mocks.kmsClient.send).toHaveBeenCalled()
      expect(mocks.prisma.userSensitive.upsert).toHaveBeenCalledOnce()
    })
  })

  describe('getUserPII', () => {
    it('returns null when no vault record exists', async () => {
      mocks.prisma.userSensitive.findUnique.mockResolvedValue(null)
      const result = await getUserPII(42)
      expect(result).toBeNull()
    })

    it('decrypts and returns the original JSON', async () => {
      // First encrypt something to get a real ciphertext
      const data = { email: 'test@example.com', phone: '555-1234' }
      const json = JSON.stringify(data)

      // Manually encrypt to build a realistic DB record
      const { encryptField } = require('../src/lib/kms/kmsEnvelope')
      const envelope = await encryptField(json)

      const dbRecord = {
        id: 1,
        userId: 42,
        ciphertext: `${envelope.alg}:${envelope.iv}:${envelope.tag}:${envelope.ciphertext}`,
        encryptedDataKey: envelope.encryptedDataKey,
        keyArn: envelope.keyArn,
      }

      mocks.prisma.userSensitive.findUnique.mockResolvedValue(dbRecord)
      const result = await getUserPII(42)
      expect(result).toEqual(data)
    })
  })

  describe('roundtrip via set + get', () => {
    it('stores and retrieves PII correctly', async () => {
      const original = { email: 'roundtrip@test.com', phone: '555-0000' }
      let storedRecord = null

      mocks.prisma.userSensitive.upsert.mockImplementation(async (args) => {
        storedRecord = { id: 1, userId: args.where.userId, ...args.create }
        return storedRecord
      })

      await setUserPII(99, original)

      mocks.prisma.userSensitive.findUnique.mockResolvedValue(storedRecord)
      const retrieved = await getUserPII(99)
      expect(retrieved).toEqual(original)
    })

    it('address fields are stripped during roundtrip', async () => {
      const input = { email: 'test@test.com', address: 'SHOULD_NOT_PERSIST' }
      let storedRecord = null

      mocks.prisma.userSensitive.upsert.mockImplementation(async (args) => {
        storedRecord = { id: 1, userId: args.where.userId, ...args.create }
        return storedRecord
      })

      await setUserPII(99, input)

      mocks.prisma.userSensitive.findUnique.mockResolvedValue(storedRecord)
      const retrieved = await getUserPII(99)
      expect(retrieved).toEqual({ email: 'test@test.com' })
      expect(retrieved.address).toBeUndefined()
    })
  })
})
