/**
 * aiAttachments.upload.test.js — service-level tests for the upload
 * orchestration. Mocks Prisma + R2 + getUserPlan so the assertions
 * focus on caps + idempotency + error paths.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const targetPath = require.resolve('../src/modules/ai/attachments/attachments.service.js')

const mocks = vi.hoisted(() => ({
  prisma: {
    aiAttachment: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aiUploadIdempotency: { findUnique: vi.fn(), upsert: vi.fn() },
    userAiStorageQuota: { upsert: vi.fn() },
    $executeRaw: vi.fn(),
  },
  r2Storage: { isR2Configured: vi.fn(() => true) },
  getUserPlan: { getUserPlan: vi.fn() },
  auditLog: { recordAudit: vi.fn() },
  sentry: { captureError: vi.fn() },
  s3: vi.fn(),
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/r2Storage'), mocks.r2Storage],
  [require.resolve('../src/lib/getUserPlan'), mocks.getUserPlan],
  [require.resolve('../src/lib/auditLog'), mocks.auditLog],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalLoad = Module._load
let svc

beforeAll(() => {
  // Avoid the actual S3 client trying to send anything — patch the
  // SDK to a benign stub.
  vi.doMock('@aws-sdk/client-s3', () => ({
    S3Client: class {
      async send() {
        return { ETag: '"abc"' }
      }
    },
    PutObjectCommand: class {},
    GetObjectCommand: class {},
    DeleteObjectCommand: class {},
  }))
  Module._load = function patched(request, parent, isMain) {
    if (request === '@aws-sdk/client-s3') {
      return {
        S3Client: class {
          async send() {
            return { ETag: '"abc"' }
          }
        },
        PutObjectCommand: class {},
        GetObjectCommand: class {},
        DeleteObjectCommand: class {},
      }
    }
    const resolved = Module._resolveFilename(request, parent, isMain)
    const mocked = mockTargets.get(resolved)
    if (mocked) return mocked
    return originalLoad.apply(this, arguments)
  }
  process.env.R2_BUCKET_AI_ATTACHMENTS = 'test-bucket'
  process.env.R2_ACCOUNT_ID = 'acct'
  process.env.R2_ACCESS_KEY_ID = 'k'
  process.env.R2_SECRET_ACCESS_KEY = 's'
  delete require.cache[targetPath]
  svc = require(targetPath)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[targetPath]
  delete process.env.R2_BUCKET_AI_ATTACHMENTS
  delete process.env.R2_ACCOUNT_ID
  delete process.env.R2_ACCESS_KEY_ID
  delete process.env.R2_SECRET_ACCESS_KEY
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.aiAttachment.count.mockResolvedValue(0)
  mocks.prisma.aiAttachment.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: 1, ...data, expiresAt: new Date(Date.now() + 86400e3) }),
  )
  mocks.prisma.aiUploadIdempotency.findUnique.mockResolvedValue(null)
  mocks.prisma.userAiStorageQuota.upsert.mockResolvedValue({})
  mocks.prisma.$executeRaw.mockResolvedValue(1) // storage quota allowed
  mocks.getUserPlan.getUserPlan.mockResolvedValue('free')
})

function makeTextBuffer(content = 'hello world\n') {
  return Buffer.from(content, 'utf8')
}

describe('uploadAttachment — happy path TXT', () => {
  it('creates an AiAttachment row and records audit log', async () => {
    const user = { id: 1, role: 'student', emailVerified: false, isStaffVerified: false }
    const result = await svc.uploadAttachment({
      user,
      buffer: makeTextBuffer(),
      fileName: 'notes.txt',
      declaredMime: 'text/plain',
    })
    expect(result.id).toBe(1)
    expect(mocks.prisma.aiAttachment.create).toHaveBeenCalledTimes(1)
    expect(mocks.auditLog.recordAudit).toHaveBeenCalledTimes(1)
  })
})

describe('uploadAttachment — oversize reject', () => {
  it('throws 413 when bytes exceed plan cap', async () => {
    const user = { id: 1, role: 'student', emailVerified: false, isStaffVerified: false }
    // Free-tier cap is 5 MB; provide a 6 MB buffer of plain ASCII.
    const big = Buffer.alloc(6 * 1024 * 1024, 0x20)
    big[big.length - 1] = 0x0a
    await expect(
      svc.uploadAttachment({
        user,
        buffer: big,
        fileName: 'huge.txt',
        declaredMime: 'text/plain',
      }),
    ).rejects.toMatchObject({ statusCode: 413 })
  })
})

describe('uploadAttachment — bad MIME reject', () => {
  it('throws 415 for an unallowed declared MIME', async () => {
    const user = { id: 1, role: 'student', emailVerified: true, isStaffVerified: false }
    await expect(
      svc.uploadAttachment({
        user,
        buffer: Buffer.from('garbage'),
        fileName: 'x.bin',
        declaredMime: 'application/x-something-weird',
      }),
    ).rejects.toMatchObject({ statusCode: 415 })
  })
})

describe('uploadAttachment — idempotency hit', () => {
  it('returns the prior attachment when Idempotency-Key matches', async () => {
    const prior = { id: 99, userId: 1, mimeType: 'text/plain' }
    mocks.prisma.aiUploadIdempotency.findUnique.mockResolvedValue({
      key: 'k123',
      userId: 1,
      attachmentId: 99,
      expiresAt: new Date(Date.now() + 60000),
    })
    mocks.prisma.aiAttachment.findUnique.mockResolvedValue(prior)
    const user = { id: 1, role: 'student', emailVerified: true, isStaffVerified: false }
    const result = await svc.uploadAttachment({
      user,
      buffer: makeTextBuffer(),
      fileName: 'notes.txt',
      declaredMime: 'text/plain',
      idempotencyKey: 'k123',
    })
    expect(result.id).toBe(99)
    // No new row was created.
    expect(mocks.prisma.aiAttachment.create).not.toHaveBeenCalled()
  })
})

describe('uploadAttachment — storage cap race rejected', () => {
  it('returns 413 when atomic UPDATE matches 0 rows', async () => {
    mocks.prisma.$executeRaw.mockResolvedValueOnce(0)
    const user = { id: 1, role: 'student', emailVerified: true, isStaffVerified: false }
    await expect(
      svc.uploadAttachment({
        user,
        buffer: makeTextBuffer(),
        fileName: 'notes.txt',
        declaredMime: 'text/plain',
      }),
    ).rejects.toMatchObject({ statusCode: 413, code: 'QUOTA_EXCEEDED' })
  })
})
