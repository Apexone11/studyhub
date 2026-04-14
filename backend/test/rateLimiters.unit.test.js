/**
 * rateLimiters.unit.test.js
 * Unit tests for backend/src/lib/rateLimiters.js
 *
 * Tests verify:
 * - All exported limiters are valid express-rate-limit middleware functions
 * - Limiter categories are complete (all expected exports present)
 * - Rate limiting behavior works on a test express app
 *
 * NOTE: express-rate-limit v7+ does not expose internal options (windowMs, max, etc.)
 * as public properties. We test the limiters by their behavior, not internal config.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import {
  authLimiter,
  writeLimiter,
  readLimiter,
  adminLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  authVerificationLimiter,
  authForgotLimiter,
  authLogoutLimiter,
  authGoogleLimiter,
  feedReactLimiter,
  feedReadLimiter,
  feedWriteLimiter,
  feedCommentLimiter,
  sheetReactLimiter,
  sheetWriteLimiter,
  sheetCommentLimiter,
  uploadAvatarLimiter,
  uploadAttachmentLimiter,
  uploadCoverLimiter,
  searchLimiter,
  messagingWriteLimiter,
  paymentCheckoutLimiter,
  paymentPortalLimiter,
  paymentReadLimiter,
  paymentWebhookLimiter,
} from '../src/lib/rateLimiters.js'

describe('rateLimiters', () => {
  describe('Limiter exports structure', () => {
    it('should export authLimiter as a function', () => {
      expect(typeof authLimiter).toBe('function')
    })

    it('should export writeLimiter as a function', () => {
      expect(typeof writeLimiter).toBe('function')
    })

    it('should export readLimiter as a function', () => {
      expect(typeof readLimiter).toBe('function')
    })

    it('should export adminLimiter as a function', () => {
      expect(typeof adminLimiter).toBe('function')
    })

    it('should export auth module limiters as functions', () => {
      expect(typeof authLoginLimiter).toBe('function')
      expect(typeof authRegisterLimiter).toBe('function')
      expect(typeof authVerificationLimiter).toBe('function')
      expect(typeof authForgotLimiter).toBe('function')
      expect(typeof authLogoutLimiter).toBe('function')
      expect(typeof authGoogleLimiter).toBe('function')
    })

    it('should export feed module limiters as functions', () => {
      expect(typeof feedReactLimiter).toBe('function')
      expect(typeof feedReadLimiter).toBe('function')
      expect(typeof feedWriteLimiter).toBe('function')
      expect(typeof feedCommentLimiter).toBe('function')
    })

    it('should export sheet module limiters as functions', () => {
      expect(typeof sheetReactLimiter).toBe('function')
      expect(typeof sheetWriteLimiter).toBe('function')
      expect(typeof sheetCommentLimiter).toBe('function')
    })

    it('should export upload limiters as functions', () => {
      expect(typeof uploadAvatarLimiter).toBe('function')
      expect(typeof uploadAttachmentLimiter).toBe('function')
      expect(typeof uploadCoverLimiter).toBe('function')
    })

    it('should export search limiter as a function', () => {
      expect(typeof searchLimiter).toBe('function')
    })

    it('should export messaging limiters as functions', () => {
      expect(typeof messagingWriteLimiter).toBe('function')
    })

    it('should export payment limiters as functions', () => {
      expect(typeof paymentCheckoutLimiter).toBe('function')
      expect(typeof paymentPortalLimiter).toBe('function')
      expect(typeof paymentReadLimiter).toBe('function')
      expect(typeof paymentWebhookLimiter).toBe('function')
    })
  })

  describe('Rate limiting behavior', () => {
    let app

    beforeEach(() => {
      app = express()
      // Strict limiter: 5 requests per 15 minutes
      app.get('/test-strict', authForgotLimiter, (req, res) => {
        res.json({ ok: true })
      })
      // Generous limiter: 200 requests per minute
      app.get('/test-generous', readLimiter, (req, res) => {
        res.json({ ok: true })
      })
      // Standard limiter: 60 requests per minute
      app.post('/test-write', writeLimiter, (req, res) => {
        res.json({ ok: true })
      })
    })

    it('should allow single request through limiter', async () => {
      const response = await request(app).get('/test-generous')
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
    })

    it('should return RateLimit-Limit header on successful request', async () => {
      const response = await request(app).get('/test-generous')
      expect(response.status).toBe(200)
      expect(response.headers['ratelimit-limit']).toBeDefined()
    })

    it('should return RateLimit-Remaining header on successful request', async () => {
      const response = await request(app).get('/test-generous')
      expect(response.status).toBe(200)
      expect(response.headers['ratelimit-remaining']).toBeDefined()
    })

    it('should return RateLimit-Reset header on successful request', async () => {
      const response = await request(app).get('/test-generous')
      expect(response.status).toBe(200)
      expect(response.headers['ratelimit-reset']).toBeDefined()
    })

    it('should not include legacy x-ratelimit headers', async () => {
      const response = await request(app).get('/test-generous')
      expect(response.headers['x-ratelimit-limit']).toBeUndefined()
      expect(response.headers['x-ratelimit-remaining']).toBeUndefined()
      expect(response.headers['x-ratelimit-reset']).toBeUndefined()
    })

    it('should reject requests after hitting strict limit', async () => {
      const agent = request.agent(app)
      let lastResponse

      // Fire 6 requests (limit is 5 per 15 min)
      for (let i = 0; i < 6; i++) {
        lastResponse = await agent.get('/test-strict')
      }

      // 6th request should be rate-limited
      expect(lastResponse.status).toBe(429)
    })

    it('should allow multiple requests within generous limit', async () => {
      const agent = request.agent(app)

      // Fire 10 requests (generous limit is 200)
      for (let i = 0; i < 10; i++) {
        const response = await agent.get('/test-generous')
        expect(response.status).toBe(200)
      }
    })

    it('should work with POST requests', async () => {
      const response = await request(app).post('/test-write').send({})
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
    })

    it('should track remaining count across requests', async () => {
      const agent = request.agent(app)

      const response1 = await agent.get('/test-generous')
      const remaining1 = parseInt(response1.headers['ratelimit-remaining'])

      const response2 = await agent.get('/test-generous')
      const remaining2 = parseInt(response2.headers['ratelimit-remaining'])

      // Each request should decrement remaining count
      expect(remaining2).toBeLessThan(remaining1)
    })
  })

  describe('Limiter naming consistency', () => {
    it('all exported limiters should follow naming pattern', () => {
      const limiters = {
        authLimiter,
        writeLimiter,
        readLimiter,
        adminLimiter,
        authLoginLimiter,
        authRegisterLimiter,
        feedReactLimiter,
        sheetCommentLimiter,
        uploadAvatarLimiter,
        searchLimiter,
      }

      Object.keys(limiters).forEach((name) => {
        expect(name).toMatch(/^[a-z][a-zA-Z]*Limiter$/)
        expect(typeof limiters[name]).toBe('function')
      })
    })
  })
})
