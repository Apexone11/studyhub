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
      auditLog: {
        create: vi.fn(),
      },
      userSensitive: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
      },
    },
  }
})

const fakeDataKey = crypto.randomBytes(32)
const fakeEncryptedBlob = crypto.randomBytes(64)

// ── Module._load patching ───────────────────────────────
const originalModuleLoad = Module._load

const mockTargets = new Map([
  [require.resolve('../src/lib/kmsClient'), { getKmsClient: mocks.getKmsClient }],
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

const { recordAudit } = require('../src/lib/auditLog')
const { setUserPII, getUserPII } = require('../src/lib/piiVault')

afterAll(() => {
  Module._load = originalModuleLoad
  delete process.env.KMS_KEY_ARN
})

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
      return Promise.resolve({ Plaintext: Uint8Array.from(fakeDataKey) })
    }
    return Promise.reject(new Error(`Unexpected: ${name}`))
  })
}

describe('auditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupKmsMocks()
    mocks.prisma.auditLog.create.mockResolvedValue({ id: 1 })
  })

  describe('recordAudit', () => {
    it('creates an audit record with all fields', async () => {
      await recordAudit({
        event: 'pii.read',
        actorId: 1,
        actorRole: 'admin',
        targetUserId: 42,
        route: '/api/admin/users/42/pii',
        method: 'GET',
      })

      expect(mocks.prisma.auditLog.create).toHaveBeenCalledOnce()
      const data = mocks.prisma.auditLog.create.mock.calls[0][0].data
      expect(data.event).toBe('pii.read')
      expect(data.actorId).toBe(1)
      expect(data.actorRole).toBe('admin')
      expect(data.targetUserId).toBe(42)
      expect(data.route).toBe('/api/admin/users/42/pii')
      expect(data.method).toBe('GET')
    })

    it('handles missing optional fields', async () => {
      await recordAudit({ event: 'pii.write' })

      const data = mocks.prisma.auditLog.create.mock.calls[0][0].data
      expect(data.event).toBe('pii.write')
      expect(data.actorId).toBeNull()
      expect(data.targetUserId).toBeNull()
    })

    it('does not store plaintext PII in audit records', async () => {
      await recordAudit({
        event: 'pii.write',
        actorId: 1,
        targetUserId: 42,
      })

      const data = mocks.prisma.auditLog.create.mock.calls[0][0].data
      // Should only have metadata keys, no PII
      const keys = Object.keys(data)
      expect(keys).not.toContain('email')
      expect(keys).not.toContain('phone')
      expect(keys).not.toContain('password')
      expect(keys).not.toContain('ciphertext')
      expect(keys).not.toContain('plaintext')
    })
  })

  describe('PII vault audit integration', () => {
    it('records pii.write audit on setUserPII', async () => {
      mocks.prisma.userSensitive.upsert.mockResolvedValue({ id: 1, userId: 42 })

      await setUserPII(42, { email: 'test@example.com' }, {
        id: 1, role: 'admin', route: '/api/admin/users/42/pii', method: 'PUT',
      })

      // Wait for the fire-and-forget audit call
      await vi.waitFor(() => {
        expect(mocks.prisma.auditLog.create).toHaveBeenCalledOnce()
      })

      const data = mocks.prisma.auditLog.create.mock.calls[0][0].data
      expect(data.event).toBe('pii.write')
      expect(data.actorId).toBe(1)
      expect(data.actorRole).toBe('admin')
      expect(data.targetUserId).toBe(42)
    })

    it('records pii.read audit on getUserPII', async () => {
      // Set up a vault record to read
      const { encryptField } = require('../src/lib/kmsEnvelope')
      const envelope = await encryptField(JSON.stringify({ email: 'test@test.com' }))
      mocks.prisma.userSensitive.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        ciphertext: `${envelope.alg}:${envelope.iv}:${envelope.tag}:${envelope.ciphertext}`,
        encryptedDataKey: envelope.encryptedDataKey,
        keyArn: envelope.keyArn,
      })

      await getUserPII(42, {
        id: 1, role: 'admin', route: '/api/admin/users/42/pii', method: 'GET',
      })

      await vi.waitFor(() => {
        expect(mocks.prisma.auditLog.create).toHaveBeenCalledOnce()
      })

      const data = mocks.prisma.auditLog.create.mock.calls[0][0].data
      expect(data.event).toBe('pii.read')
      expect(data.targetUserId).toBe(42)
    })

    it('does not record audit when getUserPII returns null', async () => {
      mocks.prisma.userSensitive.findUnique.mockResolvedValue(null)

      const result = await getUserPII(42, { id: 1 })
      expect(result).toBeNull()

      // Give time for any async audit call
      await new Promise((r) => setTimeout(r, 10))
      expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    })

    it('audit failure does not block PII operations', async () => {
      mocks.prisma.userSensitive.upsert.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'))

      // Should not throw even though audit fails
      const result = await setUserPII(42, { email: 'test@test.com' })
      expect(result).toEqual({ id: 1, userId: 42 })
    })
  })
})
