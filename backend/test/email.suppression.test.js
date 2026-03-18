import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const emailLibPath = require.resolve('../src/lib/email')

const mocks = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({
    messageId: 'message_1',
    accepted: ['allowed@example.com'],
    rejected: [],
  })

  return {
    prisma: {
      emailSuppression: {
        findMany: vi.fn(),
      },
    },
    nodemailer: {
      createTransport: vi.fn(() => ({
        sendMail,
        verify: vi.fn().mockResolvedValue(true),
      })),
    },
    sendMail,
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('nodemailer'), mocks.nodemailer],
])

const originalModuleLoad = Module._load

let emailLib

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[emailLibPath]
  emailLib = require(emailLibPath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[emailLibPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.EMAIL_TRANSPORT = 'json'
  delete process.env.EMAIL_CAPTURE_DIR
  mocks.prisma.emailSuppression.findMany.mockResolvedValue([])
})

describe('email suppression enforcement', () => {
  it('blocks email delivery to suppressed recipients', async () => {
    mocks.prisma.emailSuppression.findMany.mockResolvedValue([
      {
        email: 'blocked@example.com',
        reason: 'bounced',
      },
    ])

    await expect(emailLib.sendEmailVerification('blocked@example.com', 'blocked_user', '123456'))
      .rejects
      .toMatchObject({ code: 'EMAIL_RECIPIENT_SUPPRESSED' })

    expect(mocks.sendMail).not.toHaveBeenCalled()
  })

  it('sends emails normally when recipients are not suppressed', async () => {
    await emailLib.sendEmailVerification('allowed@example.com', 'allowed_user', '123456')

    expect(mocks.prisma.emailSuppression.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        email: { in: ['allowed@example.com'] },
      },
      select: {
        email: true,
        reason: true,
      },
    })
    expect(mocks.sendMail).toHaveBeenCalledTimes(1)
  })
})
