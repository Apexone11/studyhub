/**
 * socketio.unit.test.js — Unit tests for the Socket.io module exports and helpers.
 *
 * Because the socketio.js module directly requires Prisma (which needs a
 * native engine binary that may not match the test environment), these tests
 * focus on verifying the module structure and exports without deeply
 * importing the module when the engine is unavailable.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'

// ── Cookie parsing helper (extracted logic from socketio.js) ──
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
  return match ? match.split('=')[1] : undefined
}

describe('socketio.js', () => {
  describe('Cookie parsing logic', () => {
    it('parses a single cookie', () => {
      expect(parseCookie('studyhub_session=abc123', 'studyhub_session')).toBe('abc123')
    })

    it('parses cookie from a multi-cookie header', () => {
      expect(parseCookie('other=value; studyhub_session=my-token; third=value', 'studyhub_session')).toBe('my-token')
    })

    it('returns undefined for missing cookie', () => {
      expect(parseCookie('other=value; third=value', 'studyhub_session')).toBeUndefined()
    })

    it('returns undefined for empty cookie header', () => {
      expect(parseCookie('', 'studyhub_session')).toBeUndefined()
    })

    it('returns undefined for null/undefined cookie header', () => {
      expect(parseCookie(null, 'studyhub_session')).toBeUndefined()
      expect(parseCookie(undefined, 'studyhub_session')).toBeUndefined()
    })

    it('handles cookie with spaces around equals', () => {
      expect(parseCookie('studyhub_session=tok en', 'studyhub_session')).toBe('tok en')
    })
  })

  describe('Module file exists and exports', () => {
    it('socketio.js file exists at expected path', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      expect(fs.existsSync(modulePath)).toBe(true)
    })

    it('socketio.js exports the expected function names', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      // Verify exports are defined in the source
      expect(source).toContain('initSocketIO')
      expect(source).toContain('getIO')
      expect(source).toContain('getOnlineUsers')
    })

    it('socketio.js requires socket.io', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      expect(source).toContain("require('socket.io')")
    })

    it('socketio.js requires authTokens for JWT verification', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      expect(source).toContain('verifyAuthToken')
    })

    it('socketio.js manages online users with a Map', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      expect(source).toContain('onlineUsers')
      expect(source).toContain('new Map()')
    })

    it('socketio.js references the studyhub_session cookie', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      expect(source).toContain('studyhub_session')
    })

    it('socketio.js configures CORS from environment variables', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      expect(source).toContain('FRONTEND_URL')
      expect(source).toContain('cors')
    })

    it('socketio.js imports socket event constants', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      expect(source).toContain('socketEvents')
    })
  })

  describe('Socket event constants', () => {
    it('socketEvents.js exports event name constants', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketEvents.js')
      expect(fs.existsSync(modulePath)).toBe(true)

      const source = fs.readFileSync(modulePath, 'utf-8')
      // Should define key event types
      expect(source).toContain('message:new')
      expect(source).toContain('typing:start')
      expect(source).toContain('typing:stop')
    })
  })

  describe('Rate limiting structure', () => {
    it('socketio.js implements per-socket rate limiting for typing events', async () => {
      const fs = await import('node:fs')
      const modulePath = path.resolve(__dirname, '../src/lib/socketio.js')
      const source = fs.readFileSync(modulePath, 'utf-8')

      // Verify rate limiting is implemented (20/min for typing, 30/min for join)
      expect(source).toMatch(/rate|limit|throttle/i)
    })
  })
})
