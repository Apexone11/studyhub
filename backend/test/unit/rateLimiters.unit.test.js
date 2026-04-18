/**
 * rateLimiters.unit.test.js
 * Enforcement-level unit tests for backend/src/lib/rateLimiters.js
 *
 * Complements backend/test/rateLimiters.unit.test.js (export-shape tests).
 * These tests drive a real Express app with the actual exported limiter
 * middleware via supertest, verify 200-then-429 transitions, assert the
 * error envelope on the rejected request, check independent keying for
 * user-keyed and IP-keyed limiters, and cover skip/bypass semantics.
 *
 * Each describe block uses vi.resetModules() + dynamic import so each
 * limiter is a fresh instance with a clean in-memory store. That re-import
 * is expensive when the full suite is cold-loaded alongside it, so give
 * each test a generous timeout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const TEST_TIMEOUT_MS = 30000

const LIMITERS_PATH = '../../src/lib/rateLimiters.js'

async function freshLimiters() {
  vi.resetModules()
  return await import(LIMITERS_PATH)
}

function buildApp(attachRoute) {
  const app = express()
  app.set('trust proxy', 'loopback')
  app.use(express.json())
  attachRoute(app)
  return app
}

function injectUser(userId) {
  return (req, _res, next) => {
    req.user = { userId }
    next()
  }
}

async function hammer(agent, method, path, times, opts = {}) {
  const responses = []
  for (let i = 0; i < times; i++) {
    let r = agent[method](path)
    if (opts.ip) r = r.set('X-Forwarded-For', opts.ip)
    if (opts.body !== undefined) r = r.send(opts.body)
    responses.push(await r)
  }
  return responses
}

describe('rateLimiters enforcement', { timeout: TEST_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.resetModules()
  })

  describe('authLoginLimiter (10 / 15min, IP-keyed)', () => {
    it('allows 10 requests and 429s the 11th with an error envelope', async () => {
      const { authLoginLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/login', authLoginLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      const responses = await hammer(request(app), 'post', '/login', 11, { ip: '10.0.0.1' })

      for (let i = 0; i < 10; i++) {
        expect(responses[i].status).toBe(200)
      }
      expect(responses[10].status).toBe(429)
      expect(responses[10].body).toHaveProperty('error')
      expect(responses[10].body.error).toMatch(/too many login attempts/i)
      expect(responses[10].headers).toHaveProperty('ratelimit-limit')
    })

    it('keeps independent buckets per source IP', async () => {
      const { authLoginLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/login', authLoginLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      await hammer(request(app), 'post', '/login', 10, { ip: '10.0.0.2' })

      const blockedFirstIp = await request(app).post('/login').set('X-Forwarded-For', '10.0.0.2')
      expect(blockedFirstIp.status).toBe(429)

      const freshOtherIp = await request(app).post('/login').set('X-Forwarded-For', '10.0.0.3')
      expect(freshOtherIp.status).toBe(200)
    })
  })

  describe('paymentCheckoutLimiter (10 / 15min, keyed by userId)', () => {
    it('429s the 11th request for the same user', async () => {
      const { paymentCheckoutLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/checkout', injectUser('user-A'), paymentCheckoutLimiter, (_req, res) =>
          res.status(200).json({ ok: true }),
        )
      })

      const responses = await hammer(request(app), 'post', '/checkout', 11)
      for (let i = 0; i < 10; i++) expect(responses[i].status).toBe(200)
      expect(responses[10].status).toBe(429)
      expect(responses[10].body.error).toMatch(/too many checkout/i)
    })

    it('gives different users independent buckets even from the same IP', async () => {
      const { paymentCheckoutLimiter } = await freshLimiters()

      let currentUser = 'user-A'
      const app = buildApp((a) => {
        a.post(
          '/checkout',
          (req, _res, next) => {
            req.user = { userId: currentUser }
            next()
          },
          paymentCheckoutLimiter,
          (_req, res) => res.status(200).json({ ok: true }),
        )
      })

      currentUser = 'user-A'
      await hammer(request(app), 'post', '/checkout', 10)
      const aBlocked = await request(app).post('/checkout')
      expect(aBlocked.status).toBe(429)

      currentUser = 'user-B'
      const bFirst = await request(app).post('/checkout')
      expect(bFirst.status).toBe(200)
    })

    it('buckets anonymous (no req.user) requests together under the anon key', async () => {
      const { paymentCheckoutLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/checkout', paymentCheckoutLimiter, (_req, res) =>
          res.status(200).json({ ok: true }),
        )
      })

      const responses = await hammer(request(app), 'post', '/checkout', 11, { ip: '10.0.1.1' })
      expect(responses[10].status).toBe(429)

      const stillBlockedFromDifferentIp = await request(app)
        .post('/checkout')
        .set('X-Forwarded-For', '10.0.1.2')
      expect(stillBlockedFromDifferentIp.status).toBe(429)
    })
  })

  describe('paymentWebhookLimiter (100 / 1min, IP-keyed)', () => {
    it('429s the 101st request within the window', async () => {
      const { paymentWebhookLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/webhook', paymentWebhookLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      const agent = request(app)
      for (let i = 0; i < 100; i++) {
        const r = await agent.post('/webhook').set('X-Forwarded-For', '10.0.2.1')
        expect(r.status).toBe(200)
      }
      const blocked = await agent.post('/webhook').set('X-Forwarded-For', '10.0.2.1')
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/too many webhook/i)
    })

    it('does not share state across different source IPs', async () => {
      const { paymentWebhookLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/webhook', paymentWebhookLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      for (let i = 0; i < 100; i++) {
        await request(app).post('/webhook').set('X-Forwarded-For', '10.0.2.10')
      }
      const blocked = await request(app).post('/webhook').set('X-Forwarded-For', '10.0.2.10')
      expect(blocked.status).toBe(429)

      const fresh = await request(app).post('/webhook').set('X-Forwarded-For', '10.0.2.11')
      expect(fresh.status).toBe(200)
    })
  })

  describe('messagingWriteLimiter (60 / 1min, IP-keyed)', () => {
    it('429s the 61st request with the messaging error envelope', async () => {
      const { messagingWriteLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/messages', messagingWriteLimiter, (_req, res) =>
          res.status(200).json({ ok: true }),
        )
      })

      const agent = request(app)
      for (let i = 0; i < 60; i++) {
        const r = await agent
          .post('/messages')
          .set('X-Forwarded-For', '10.0.3.1')
          .send({ body: 'x' })
        expect(r.status).toBe(200)
      }
      const blocked = await agent
        .post('/messages')
        .set('X-Forwarded-For', '10.0.3.1')
        .send({ body: 'x' })
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/too many messages/i)
    })
  })

  describe('notesMutateLimiter (30 / 1min, IP-keyed)', () => {
    it('429s the 31st mutation', async () => {
      const { notesMutateLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/notes', notesMutateLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      const agent = request(app)
      for (let i = 0; i < 30; i++) {
        const r = await agent.post('/notes').set('X-Forwarded-For', '10.0.4.1')
        expect(r.status).toBe(200)
      }
      const blocked = await agent.post('/notes').set('X-Forwarded-For', '10.0.4.1')
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/please slow down/i)
    })
  })

  describe('searchLimiter (120 / 1min, IP-keyed)', () => {
    it('allows burst up to 120 and rejects the 121st', async () => {
      const { searchLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.get('/search', searchLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      const agent = request(app)
      for (let i = 0; i < 120; i++) {
        const r = await agent.get('/search').set('X-Forwarded-For', '10.0.5.1')
        expect(r.status).toBe(200)
      }
      const blocked = await agent.get('/search').set('X-Forwarded-For', '10.0.5.1')
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/too many search/i)
    })
  })

  describe('videoUploadChunkLimiter (200 / 1min, keyed by userId)', () => {
    it('429s the 201st chunk for the same user', async () => {
      const { videoUploadChunkLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/chunk', injectUser('video-user-1'), videoUploadChunkLimiter, (_req, res) =>
          res.status(200).json({ ok: true }),
        )
      })

      const agent = request(app)
      for (let i = 0; i < 200; i++) {
        const r = await agent.post('/chunk')
        expect(r.status).toBe(200)
      }
      const blocked = await agent.post('/chunk')
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/upload speed/i)
    })

    it('gives different users independent 200-chunk budgets', async () => {
      const { videoUploadChunkLimiter } = await freshLimiters()

      let currentUser = 'video-user-2'
      const app = buildApp((a) => {
        a.post(
          '/chunk',
          (req, _res, next) => {
            req.user = { userId: currentUser }
            next()
          },
          videoUploadChunkLimiter,
          (_req, res) => res.status(200).json({ ok: true }),
        )
      })

      currentUser = 'video-user-2'
      for (let i = 0; i < 200; i++) {
        await request(app).post('/chunk')
      }
      const user2Blocked = await request(app).post('/chunk')
      expect(user2Blocked.status).toBe(429)

      currentUser = 'video-user-3'
      const user3First = await request(app).post('/chunk')
      expect(user3First.status).toBe(200)
    })
  })

  describe('RateLimit headers on standard limiter responses', () => {
    it('includes ratelimit-limit / ratelimit-remaining / ratelimit-reset on 200 and 429', async () => {
      const { notesMutateLimiter } = await freshLimiters()
      const app = buildApp((a) => {
        a.post('/notes', notesMutateLimiter, (_req, res) => res.status(200).json({ ok: true }))
      })

      const okRes = await request(app).post('/notes').set('X-Forwarded-For', '10.0.6.1')
      expect(okRes.status).toBe(200)
      expect(okRes.headers['ratelimit-limit']).toBeDefined()
      expect(okRes.headers['ratelimit-remaining']).toBeDefined()
      expect(okRes.headers['ratelimit-reset']).toBeDefined()
      expect(okRes.headers['x-ratelimit-limit']).toBeUndefined()

      const agent = request(app)
      for (let i = 0; i < 29; i++) {
        await agent.post('/notes').set('X-Forwarded-For', '10.0.6.2')
      }
      await agent.post('/notes').set('X-Forwarded-For', '10.0.6.2')
      const blockedRes = await agent.post('/notes').set('X-Forwarded-For', '10.0.6.2')
      expect(blockedRes.status).toBe(429)
      expect(blockedRes.headers['ratelimit-limit']).toBeDefined()
    })
  })

  describe('Custom keyGenerator sanity (notesPatchLimiter, 120/min per-user)', () => {
    it('keys by req.user.userId so two users share no budget', async () => {
      const { notesPatchLimiter } = await freshLimiters()

      let currentUser = 'notes-user-X'
      const app = buildApp((a) => {
        a.patch(
          '/notes/1',
          (req, _res, next) => {
            req.user = { userId: currentUser }
            next()
          },
          notesPatchLimiter,
          (_req, res) => res.status(200).json({ ok: true }),
        )
      })

      currentUser = 'notes-user-X'
      for (let i = 0; i < 120; i++) {
        const r = await request(app).patch('/notes/1')
        expect(r.status).toBe(200)
      }
      const xBlocked = await request(app).patch('/notes/1')
      expect(xBlocked.status).toBe(429)

      currentUser = 'notes-user-Y'
      const yFirst = await request(app).patch('/notes/1')
      expect(yFirst.status).toBe(200)
    })
  })
})

describe('rateLimiters bypass semantics', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('does not enforce a write limiter on an unrelated read route using a fresh readLimiter', async () => {
    const { writeLimiter, readLimiter } = await freshLimiters()
    const app = buildApp((a) => {
      a.post('/write', writeLimiter, (_req, res) => res.status(200).json({ ok: true }))
      a.get('/read', readLimiter, (_req, res) => res.status(200).json({ ok: true }))
    })

    const agent = request(app)
    for (let i = 0; i < 60; i++) {
      await agent.post('/write').set('X-Forwarded-For', '10.1.0.1')
    }
    const postBlocked = await agent.post('/write').set('X-Forwarded-For', '10.1.0.1')
    expect(postBlocked.status).toBe(429)

    const stillReadable = await agent.get('/read').set('X-Forwarded-For', '10.1.0.1')
    expect(stillReadable.status).toBe(200)
  })

  it('OPTIONS request passes through when the limiter is only attached to POST', async () => {
    const { messagingWriteLimiter } = await freshLimiters()
    const app = buildApp((a) => {
      a.post('/msg', messagingWriteLimiter, (_req, res) => res.status(200).json({ ok: true }))
      a.options('/msg', (_req, res) => res.status(204).end())
    })

    const agent = request(app)
    for (let i = 0; i < 60; i++) {
      await agent.post('/msg').set('X-Forwarded-For', '10.1.1.1').send({ body: 'x' })
    }
    const blocked = await agent.post('/msg').set('X-Forwarded-For', '10.1.1.1').send({ body: 'x' })
    expect(blocked.status).toBe(429)

    const preflight = await agent.options('/msg').set('X-Forwarded-For', '10.1.1.1')
    expect(preflight.status).toBe(204)
  })
})

describe('createAiMessageLimiter factory', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('enforces the rpm limit passed into the factory, keyed by userId', async () => {
    const { createAiMessageLimiter } = await freshLimiters()
    const limiter = createAiMessageLimiter(3)

    const app = buildApp((a) => {
      a.post('/ai', injectUser('ai-user-1'), limiter, (_req, res) =>
        res.status(200).json({ ok: true }),
      )
    })

    const agent = request(app)
    for (let i = 0; i < 3; i++) {
      const r = await agent.post('/ai')
      expect(r.status).toBe(200)
    }
    const blocked = await agent.post('/ai')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/too many ai/i)
  })

  it('returns a fresh limiter instance on each call so limits do not leak between users', async () => {
    const { createAiMessageLimiter } = await freshLimiters()
    const limiterA = createAiMessageLimiter(2)
    const limiterB = createAiMessageLimiter(2)
    expect(limiterA).not.toBe(limiterB)

    const appA = buildApp((a) => {
      a.post('/ai', injectUser('ai-A'), limiterA, (_req, res) => res.status(200).json({ ok: true }))
    })
    const appB = buildApp((a) => {
      a.post('/ai', injectUser('ai-B'), limiterB, (_req, res) => res.status(200).json({ ok: true }))
    })

    await request(appA).post('/ai')
    await request(appA).post('/ai')
    const aBlocked = await request(appA).post('/ai')
    expect(aBlocked.status).toBe(429)

    const bFirst = await request(appB).post('/ai')
    expect(bFirst.status).toBe(200)
  })
})
