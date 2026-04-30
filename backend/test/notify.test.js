import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notifyModulePath = require.resolve('../src/lib/notify')
const emailTransportPath = require.resolve('../src/lib/email/emailTransport')
const socketioPath = require.resolve('../src/lib/socketio')
const socketEventsPath = require.resolve('../src/lib/socketEvents')

const mocks = vi.hoisted(() => ({
  emailTransport: {
    deliverMail: vi.fn(),
    getFromAddress: vi.fn(() => 'noreply@studyhub.test'),
    getPublicAppUrl: vi.fn(() => 'https://studyhub.test'),
    escapeHtml: vi.fn((value) => String(value)),
  },
  socketio: {
    emitToUser: vi.fn(),
  },
  socketEvents: {
    NOTIFICATION_NEW: 'notification:new',
  },
}))

const originalModuleLoad = Module._load

let notify

function createPrismaMock() {
  return {
    notification: {
      create: vi.fn(async ({ data, include }) => ({
        id: 1,
        ...data,
        actor: include?.actor
          ? { id: data.actorId, username: 'actor_user', avatarUrl: null }
          : undefined,
      })),
      findFirst: vi.fn(),
    },
    userPreferences: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(async () => ({
        email: 'user@studyhub.test',
        emailVerified: true,
        username: 'notify_user',
      })),
    },
  }
}

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)

    if (resolvedRequest === emailTransportPath) {
      return mocks.emailTransport
    }

    if (resolvedRequest === socketioPath) {
      return mocks.socketio
    }

    if (resolvedRequest === socketEventsPath) {
      return mocks.socketEvents
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[notifyModulePath]
  notify = require(notifyModulePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notifyModulePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  notify._emailDedup.clear()
  notify._burstQueues.clear()
})

describe('notify.createNotification', () => {
  it('skips optional in-app notifications when the category is disabled', async () => {
    const prisma = createPrismaMock()
    prisma.userPreferences.findUnique.mockResolvedValue({
      inAppNotifications: true,
      inAppSocial: false,
    })

    const result = await notify.createNotification(prisma, {
      userId: 42,
      type: 'star',
      message: 'Someone starred your sheet.',
      actorId: 10,
    })

    expect(result).toBeNull()
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(mocks.emailTransport.deliverMail).not.toHaveBeenCalled()
  })

  it('keeps essential account alerts enabled even when routine inbox alerts are off', async () => {
    const prisma = createPrismaMock()
    prisma.userPreferences.findUnique.mockResolvedValue({
      inAppNotifications: false,
      inAppMentions: false,
      inAppComments: false,
      inAppSocial: false,
      inAppContributions: false,
      inAppStudyGroups: false,
    })

    await notify.createNotification(prisma, {
      userId: 42,
      type: 'moderation',
      message: 'Your account has been restricted.',
      priority: 'high',
    })

    await vi.waitFor(() => {
      expect(mocks.emailTransport.deliverMail).toHaveBeenCalledTimes(1)
    })

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          type: 'moderation',
          priority: 'high',
        }),
        include: {
          actor: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
      }),
    )
  })

  it('pushes socket notifications with the actor shape used by polling', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const prisma = createPrismaMock()

    try {
      await notify.createNotification(prisma, {
        userId: 42,
        type: 'mention',
        message: 'actor_user mentioned you.',
        actorId: 10,
      })
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }

    expect(mocks.socketio.emitToUser).toHaveBeenCalledWith(
      42,
      'notification:new',
      expect.objectContaining({
        actorId: 10,
        actor: { id: 10, username: 'actor_user', avatarUrl: null },
      }),
    )
  })

  it('sends opted-in emails for medium-priority mention notifications', async () => {
    const prisma = createPrismaMock()
    prisma.userPreferences.findUnique.mockResolvedValue({
      emailMentions: true,
    })

    await notify.createNotification(prisma, {
      userId: 42,
      type: 'mention',
      message: 'studyhub_owner mentioned you.',
      actorId: 10,
      linkPath: '/feed?post=12',
    })

    await vi.waitFor(() => {
      expect(mocks.emailTransport.deliverMail).toHaveBeenCalledTimes(1)
    })

    expect(mocks.emailTransport.deliverMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@studyhub.test',
        subject: 'StudyHub — You Were Mentioned',
      }),
      'notification-preference-email',
    )
  })

  it('suppresses optional emails when the matching preference is disabled', async () => {
    const prisma = createPrismaMock()
    prisma.userPreferences.findUnique.mockResolvedValue({
      emailMentions: false,
    })

    await notify.createNotification(prisma, {
      userId: 42,
      type: 'mention',
      message: 'studyhub_owner mentioned you.',
      actorId: 10,
      linkPath: '/feed?post=12',
    })

    await Promise.resolve()

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mocks.emailTransport.deliverMail).not.toHaveBeenCalled()
  })
})
