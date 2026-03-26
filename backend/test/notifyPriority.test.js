import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S-8: Tests for priority-aware notification creation.
 * Verifies:
 *   - priority field is stored on notification
 *   - invalid priority defaults to 'medium'
 *   - high priority triggers email delivery
 *   - self-notification is skipped
 */

const require = createRequire(import.meta.url)
const notifyPath = require.resolve('../src/lib/notify')

const mockPrisma = {
  notification: {
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}

const mockDeliverMail = vi.fn()
const mockEmailTransport = {
  deliverMail: mockDeliverMail,
  getFromAddress: () => 'test@studyhub.org',
  getPublicAppUrl: () => 'https://studyhub.org',
  escapeHtml: (v) => String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mockPrisma],
  [require.resolve('../src/lib/emailTransport'), mockEmailTransport],
])

const originalModuleLoad = Module._load
let createNotification, VALID_PRIORITIES

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mocked = mockTargets.get(resolvedRequest)
    if (mocked !== undefined) return mocked
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[notifyPath]
  const mod = require(notifyPath)
  createNotification = mod.createNotification
  VALID_PRIORITIES = mod.VALID_PRIORITIES
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notifyPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.notification.create.mockResolvedValue({ id: 1, priority: 'medium' })
})

describe('createNotification priority', () => {
  it('stores priority field on notification', async () => {
    await createNotification(mockPrisma, {
      userId: 1,
      type: 'moderation',
      message: 'test',
      priority: 'high',
    })

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priority: 'high' }),
    })
  })

  it('defaults invalid priority to medium', async () => {
    await createNotification(mockPrisma, {
      userId: 1,
      type: 'comment',
      message: 'test',
      priority: 'invalid',
    })

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priority: 'medium' }),
    })
  })

  it('defaults missing priority to medium', async () => {
    await createNotification(mockPrisma, {
      userId: 1,
      type: 'star',
      message: 'test',
    })

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priority: 'medium' }),
    })
  })

  it('skips self-notifications', async () => {
    await createNotification(mockPrisma, {
      userId: 1,
      actorId: 1,
      type: 'star',
      message: 'test',
      priority: 'high',
    })

    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
  })

  it('triggers email for high priority with verified email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'user@test.com',
      emailVerified: true,
      username: 'testuser',
    })

    await createNotification(mockPrisma, {
      userId: 1,
      type: 'moderation',
      message: 'You received a strike',
      priority: 'high',
      linkPath: '/settings?tab=account',
    })

    // Email is fire-and-forget, give it a tick to resolve
    await new Promise((r) => setTimeout(r, 50))

    expect(mockDeliverMail).toHaveBeenCalledTimes(1)
    expect(mockDeliverMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        subject: expect.stringContaining('Moderation Notice'),
      }),
      'high-priority-notification',
    )
  })

  it('does not send email for medium priority', async () => {
    await createNotification(mockPrisma, {
      userId: 1,
      type: 'comment',
      message: 'test',
      priority: 'medium',
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(mockDeliverMail).not.toHaveBeenCalled()
  })

  it('does not send email when user has no verified email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'user@test.com',
      emailVerified: false,
      username: 'testuser',
    })

    await createNotification(mockPrisma, {
      userId: 1,
      type: 'moderation',
      message: 'test',
      priority: 'high',
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(mockDeliverMail).not.toHaveBeenCalled()
  })

  it('exports VALID_PRIORITIES', () => {
    expect(VALID_PRIORITIES).toEqual(['high', 'medium', 'low'])
  })
})
