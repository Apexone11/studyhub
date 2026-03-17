import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import requireAuth from '../src/middleware/auth'
import csrfProtection from '../src/middleware/csrf'
import { guardedMode } from '../src/middleware/guardedMode'
import { AUTH_COOKIE_NAME, signAuthToken, signCsrfToken } from '../src/lib/authTokens'

const ORIGINAL_GUARDED_MODE = process.env.GUARDED_MODE
const ORIGINAL_GUARDED_MODE_ENABLED = process.env.GUARDED_MODE_ENABLED

function authToken(user = { id: 100, username: 'test-user', role: 'student' }) {
  return signAuthToken(user)
}

function csrfToken(user = { id: 100, username: 'test-user', role: 'student' }) {
  return signCsrfToken(user)
}

afterEach(() => {
  if (ORIGINAL_GUARDED_MODE === undefined) delete process.env.GUARDED_MODE
  else process.env.GUARDED_MODE = ORIGINAL_GUARDED_MODE

  if (ORIGINAL_GUARDED_MODE_ENABLED === undefined) delete process.env.GUARDED_MODE_ENABLED
  else process.env.GUARDED_MODE_ENABLED = ORIGINAL_GUARDED_MODE_ENABLED
})

describe('release A middleware response envelope', () => {
  it('returns AUTH_REQUIRED for missing auth token', async () => {
    const app = express()
    app.use(requireAuth)
    app.get('/protected', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app).get('/protected')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Login required.',
      code: 'AUTH_REQUIRED',
    })
  })

  it('returns AUTH_EXPIRED for invalid auth token', async () => {
    const app = express()
    app.use(requireAuth)
    app.get('/protected', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Invalid or expired token.',
      code: 'AUTH_EXPIRED',
    })
  })

  it('returns CSRF_INVALID when csrf token is missing for cookie-authenticated request', async () => {
    const app = express()
    app.use(csrfProtection)
    app.post('/mutate', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app)
      .post('/mutate')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${authToken()}`])

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      error: 'Missing CSRF token.',
      code: 'CSRF_INVALID',
    })
  })

  it('returns AUTH_EXPIRED when cookie session is invalid in csrf middleware', async () => {
    const app = express()
    app.use(csrfProtection)
    app.post('/mutate', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app)
      .post('/mutate')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=not-a-valid-token`])
      .set('x-csrf-token', csrfToken())

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Invalid or expired session.',
      code: 'AUTH_EXPIRED',
    })
  })

  it('returns GUARDED_MODE for non-admin write requests in guarded mode', async () => {
    process.env.GUARDED_MODE_ENABLED = 'true'

    const app = express()
    app.use(express.json())
    app.use(guardedMode)
    app.post('/api/feed/posts', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app)
      .post('/api/feed/posts')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ content: 'hello' })

    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({
      code: 'GUARDED_MODE',
    })
  })

  it('allows admin write requests during guarded mode', async () => {
    process.env.GUARDED_MODE_ENABLED = 'true'

    const app = express()
    app.use(express.json())
    app.use(guardedMode)
    app.post('/api/feed/posts', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app)
      .post('/api/feed/posts')
      .set('Authorization', `Bearer ${authToken({ id: 1, username: 'admin', role: 'admin' })}`)
      .send({ content: 'hello' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('keeps login path usable for non-admin users during guarded mode', async () => {
    process.env.GUARDED_MODE_ENABLED = 'true'

    const app = express()
    app.use(express.json())
    app.use(guardedMode)
    app.post('/api/auth/login', (req, res) => res.status(200).json({ ok: true }))

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })
})
