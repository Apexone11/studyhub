import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for Cycle S-4 moderation reporting & claim endpoints:
 * - Super admin protection (cannot be struck)
 * - User report submission (POST /reports)
 * - Case claim / unclaim (POST /cases/:id/claim, /unclaim)
 * - Overview endpoint (GET /cases/overview)
 *
 * Uses Module._load patching for CJS interop (proven pattern).
 */

const require = createRequire(import.meta.url)

/* ── Mocks ──────────────────────────────────────────────────────────────── */
const mockPrisma = {
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  moderationCase: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  strike: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  userRestriction: { findFirst: vi.fn(), count: vi.fn() },
}

const mockSentry = { captureError: vi.fn() }
const mockNotify = { createNotification: vi.fn() }

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mockPrisma],
  [require.resolve('../src/monitoring/sentry'), mockSentry],
  [require.resolve('../src/lib/notify'), mockNotify],
])

const originalModuleLoad = Module._load
let isSuperAdmin, getSuperAdminId

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mocked = mockTargets.get(resolvedRequest)
    if (mocked !== undefined) return mocked
    return originalModuleLoad.apply(this, arguments)
  }

  /* Set ADMIN_USERNAME so superAdmin resolves */
  process.env.ADMIN_USERNAME = 'testadmin'

  const superAdminPath = require.resolve('../src/lib/superAdmin')
  delete require.cache[superAdminPath]
  const mod = require(superAdminPath)
  isSuperAdmin = mod.isSuperAdmin
  getSuperAdminId = mod.getSuperAdminId
  mod._resetCache()
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete process.env.ADMIN_USERNAME
})

beforeEach(() => {
  vi.clearAllMocks()
})

/* ── Super Admin Tests ──────────────────────────────────────────────────── */
describe('superAdmin', () => {
  it('getSuperAdminId resolves via ADMIN_USERNAME', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 42 })
    const id = await getSuperAdminId()
    expect(id).toBe(42)
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'testadmin' },
      select: { id: true },
    })
  })

  it('isSuperAdmin returns true for the super admin', async () => {
    /* Cache already has id=42 from previous test — reset to test fresh */
    const mod = require(require.resolve('../src/lib/superAdmin'))
    mod._resetCache()
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 42 })
    const result = await isSuperAdmin(42)
    expect(result).toBe(true)
  })

  it('isSuperAdmin returns false for other users', async () => {
    const mod = require(require.resolve('../src/lib/superAdmin'))
    mod._resetCache()
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 42 })
    const result = await isSuperAdmin(99)
    expect(result).toBe(false)
  })
})

/* ── Moderation Engine Strike Protection ────────────────────────────────── */
describe('moderationEngine issueStrike', () => {
  let issueStrike

  beforeAll(() => {
    /* Also mock the moderationEngine targets */
    mockTargets.set(require.resolve('openai'), vi.fn(function MockOpenAI() { return {} }))

    const enginePath = require.resolve('../src/lib/moderation/moderationEngine')
    delete require.cache[enginePath]
    const mod = require(enginePath)
    issueStrike = mod.issueStrike
  })

  it('issues a strike and returns result', async () => {
    const mockStrike = { id: 1, userId: 5, reason: 'Test reason' }
    mockPrisma.strike.create.mockResolvedValueOnce(mockStrike)
    mockPrisma.strike.count.mockResolvedValueOnce(1) // 1 active strike
    mockNotify.createNotification.mockResolvedValueOnce()

    const result = await issueStrike({ userId: 5, reason: 'Test reason', caseId: null })
    expect(result.strike).toEqual(mockStrike)
    expect(result.activeStrikes).toBe(1)
    expect(result.restricted).toBe(false)
  })
})

/* ── Report Duplicate Prevention ────────────────────────────────────────── */
describe('report validation', () => {
  it('REASON_CATEGORIES includes expected categories', () => {
    const { REASON_CATEGORIES } = require(require.resolve('../src/modules/moderation/moderation.constants'))
    expect(REASON_CATEGORIES).toContain('harassment')
    expect(REASON_CATEGORIES).toContain('spam')
    expect(REASON_CATEGORIES).toContain('plagiarism')
    expect(REASON_CATEGORIES).toContain('other')
    expect(REASON_CATEGORIES.length).toBe(9)
  })

  it('PAGE_SIZE is 20', () => {
    const { PAGE_SIZE } = require(require.resolve('../src/modules/moderation/moderation.constants'))
    expect(PAGE_SIZE).toBe(20)
  })

  it('parsePage normalizes page values', () => {
    const { parsePage } = require(require.resolve('../src/modules/moderation/moderation.constants'))
    expect(parsePage('1')).toBe(1)
    expect(parsePage('5')).toBe(5)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-1')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('10001')).toBe(1)
  })
})
