import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const webhooksRoutePath = require.resolve('../src/modules/webhooks')

const mocks = vi.hoisted(() => {
  const prisma = {
    emailDeliveryEvent: {
      create: vi.fn(),
    },
    emailSuppression: {
      upsert: vi.fn(),
    },
    emailSuppressionAudit: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  const sentry = {
    captureError: vi.fn(),
  }

  const verifyWebhook = vi.fn()

  class MockWebhook {
    constructor(secret) {
      this.secret = secret
    }

    verify(payload, headers) {
      return verifyWebhook(payload, headers)
    }
  }

  return {
    prisma,
    sentry,
    svix: {
      verifyWebhook,
      MockWebhook,
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('svix'), { Webhook: mocks.svix.MockWebhook }],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[webhooksRoutePath]
  const webhooksRouterModule = require(webhooksRoutePath)
  const webhooksRouter = webhooksRouterModule.default || webhooksRouterModule

  app = express()
  app.use('/api/webhooks', webhooksRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[webhooksRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test_secret'
  process.env.RESEND_WEBHOOK_STRICT = 'true'
  mocks.prisma.emailDeliveryEvent.create.mockResolvedValue({ id: 1 })
  mocks.prisma.emailSuppression.upsert.mockResolvedValue({ id: 1 })
  mocks.prisma.emailSuppressionAudit.create.mockResolvedValue({ id: 1 })
  mocks.prisma.$transaction.mockImplementation(async (operation) => operation(mocks.prisma))
})

describe('webhooks routes', () => {
  it('verifies and persists signed Resend webhook events', async () => {
    const payload = {
      type: 'email.delivered',
      created_at: '2026-03-17T20:00:00.000Z',
      data: {
        email_id: 'email_123',
        to: ['student@example.com'],
        subject: 'Verify your StudyHub email',
      },
    }

    mocks.svix.verifyWebhook.mockReturnValue(payload)

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_123')
      .set('svix-timestamp', '1710700000')
      .set('svix-signature', 'v1,fake-signature')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      eventType: 'email.delivered',
      duplicate: false,
    })

    expect(mocks.svix.verifyWebhook).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        'svix-id': 'msg_123',
        'svix-timestamp': '1710700000',
        'svix-signature': 'v1,fake-signature',
      }),
    )

    expect(mocks.prisma.emailDeliveryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'resend',
        eventType: 'email.delivered',
        providerWebhookId: 'svix:msg_123',
        providerMessageId: 'email_123',
        recipient: 'student@example.com',
        subject: 'Verify your StudyHub email',
        eventCreatedAt: expect.any(Date),
      }),
    })
    expect(mocks.prisma.emailSuppression.upsert).not.toHaveBeenCalled()
    expect(mocks.prisma.emailSuppressionAudit.create).not.toHaveBeenCalled()
  })

  it('rejects signed webhook payloads when signature verification fails', async () => {
    mocks.svix.verifyWebhook.mockImplementation(() => {
      throw new Error('signature mismatch')
    })

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_bad')
      .set('svix-timestamp', '1710700000')
      .set('svix-signature', 'v1,bad-signature')
      .send(JSON.stringify({ type: 'email.sent', data: {} }))

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid webhook request.' })
    expect(mocks.prisma.emailDeliveryEvent.create).not.toHaveBeenCalled()
    expect(mocks.sentry.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'resendWebhookSignatureVerification' }),
    )
  })

  it('accepts unsigned payloads only when strict mode is disabled', async () => {
    process.env.RESEND_WEBHOOK_SECRET = ''
    process.env.RESEND_WEBHOOK_STRICT = 'false'

    const payload = {
      type: 'email.bounced',
      created_at: '2026-03-17T20:05:00.000Z',
      data: {
        email_id: 'email_456',
        to: ['bounced@example.com'],
        subject: 'StudyHub alert',
        bounce: {
          type: 'Permanent',
          subType: 'General',
        },
      },
    }

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      eventType: 'email.bounced',
      duplicate: false,
    })
    expect(mocks.svix.verifyWebhook).not.toHaveBeenCalled()
    expect(mocks.prisma.emailDeliveryEvent.create).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.emailSuppression.upsert).toHaveBeenCalledWith({
      where: { email: 'bounced@example.com' },
      update: expect.objectContaining({
        active: true,
        reason: 'bounced',
      }),
      create: expect.objectContaining({
        email: 'bounced@example.com',
        active: true,
        reason: 'bounced',
      }),
    })
    expect(mocks.prisma.emailSuppressionAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        suppressionId: 1,
        action: 'auto-suppress',
      }),
    })
  })

  it('creates suppression records for complaint webhook events', async () => {
    const payload = {
      type: 'email.complained',
      created_at: '2026-03-17T20:08:00.000Z',
      data: {
        email_id: 'email_987',
        to: ['complaint@example.com'],
        subject: 'StudyHub verify',
        complaint: {
          type: 'abuse',
        },
      },
    }

    mocks.svix.verifyWebhook.mockReturnValue(payload)

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_complaint')
      .set('svix-timestamp', '1710700000')
      .set('svix-signature', 'v1,complaint-signature')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      eventType: 'email.complained',
      duplicate: false,
    })

    expect(mocks.prisma.emailSuppression.upsert).toHaveBeenCalledWith({
      where: { email: 'complaint@example.com' },
      update: expect.objectContaining({
        active: true,
        reason: 'complained',
      }),
      create: expect.objectContaining({
        email: 'complaint@example.com',
        active: true,
        reason: 'complained',
      }),
    })
    expect(mocks.prisma.emailSuppressionAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        suppressionId: 1,
        action: 'auto-suppress',
      }),
    })
  })

  it('does not suppress recipients for transient bounce events', async () => {
    const payload = {
      type: 'email.bounced',
      created_at: '2026-03-17T20:09:00.000Z',
      data: {
        email_id: 'email_654',
        to: ['temporary@example.com'],
        bounce: {
          type: 'Transient',
          subType: 'MailboxFull',
        },
      },
    }

    mocks.svix.verifyWebhook.mockReturnValue(payload)

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_transient')
      .set('svix-timestamp', '1710700000')
      .set('svix-signature', 'v1,transient-signature')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      eventType: 'email.bounced',
      duplicate: false,
    })
    expect(mocks.prisma.emailSuppression.upsert).not.toHaveBeenCalled()
    expect(mocks.prisma.emailSuppressionAudit.create).not.toHaveBeenCalled()
  })

  it('fails closed when strict mode is enabled without a webhook secret', async () => {
    process.env.RESEND_WEBHOOK_SECRET = ''
    process.env.RESEND_WEBHOOK_STRICT = 'true'

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'email.sent', data: {} }))

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'Webhook endpoint is not configured.' })
    expect(mocks.prisma.emailDeliveryEvent.create).not.toHaveBeenCalled()
    expect(mocks.sentry.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'resendWebhookConfig' }),
    )
  })

  it('treats duplicate webhook deliveries as idempotent success', async () => {
    const payload = {
      type: 'email.opened',
      created_at: '2026-03-17T20:10:00.000Z',
      data: {
        email_id: 'email_789',
        to: ['reader@example.com'],
      },
    }

    mocks.svix.verifyWebhook.mockReturnValue(payload)
    mocks.prisma.emailDeliveryEvent.create.mockRejectedValue({ code: 'P2002' })

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_duplicate')
      .set('svix-timestamp', '1710700000')
      .set('svix-signature', 'v1,dupe-signature')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      eventType: 'email.opened',
      duplicate: true,
    })
  })
})
