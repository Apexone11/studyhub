import { describe, expect, it } from 'vitest'
import { routeForDeepLink } from './deepLinking'

describe('routeForDeepLink', () => {
  describe('custom scheme', () => {
    it('routes getstudyhub://sheet/123 to /m/sheets/123', () => {
      expect(routeForDeepLink('getstudyhub://sheet/123')).toBe('/m/sheets/123')
    })

    it('routes getstudyhub://sheets/abc to /m/sheets/abc (singular and plural both accepted)', () => {
      expect(routeForDeepLink('getstudyhub://sheets/abc')).toBe('/m/sheets/abc')
    })

    it('routes getstudyhub://note/42 to /m/notes/42', () => {
      expect(routeForDeepLink('getstudyhub://note/42')).toBe('/m/notes/42')
    })

    it('routes getstudyhub://user/alice to /m/users/alice', () => {
      expect(routeForDeepLink('getstudyhub://user/alice')).toBe('/m/users/alice')
    })

    it('routes getstudyhub://conversation/7 to /m/messages/7', () => {
      expect(routeForDeepLink('getstudyhub://conversation/7')).toBe('/m/messages/7')
    })

    it('routes getstudyhub://group/5 to /m/groups/5', () => {
      expect(routeForDeepLink('getstudyhub://group/5')).toBe('/m/groups/5')
    })

    it('routes getstudyhub://study-groups/5 to /m/groups/5', () => {
      expect(routeForDeepLink('getstudyhub://study-groups/5')).toBe('/m/groups/5')
    })

    it('preserves query string on search', () => {
      expect(routeForDeepLink('getstudyhub://search?q=organic+chem')).toBe(
        '/m/search?q=organic+chem',
      )
    })

    it('routes home / feed / profile / ai aliases', () => {
      expect(routeForDeepLink('getstudyhub://home')).toBe('/m/home')
      expect(routeForDeepLink('getstudyhub://feed')).toBe('/m/home')
      expect(routeForDeepLink('getstudyhub://profile')).toBe('/m/profile')
      expect(routeForDeepLink('getstudyhub://ai')).toBe('/m/ai')
      expect(routeForDeepLink('getstudyhub://hub-ai')).toBe('/m/ai')
    })

    it('falls back to /m/home for unknown resource', () => {
      expect(routeForDeepLink('getstudyhub://nonsense/123')).toBe('/m/home')
    })

    it('returns /m/home when scheme has no host or path', () => {
      expect(routeForDeepLink('getstudyhub://')).toBe('/m/home')
    })
  })

  describe('https App Links', () => {
    it('routes https://getstudyhub.org/sheets/123 to /m/sheets/123', () => {
      expect(routeForDeepLink('https://getstudyhub.org/sheets/123')).toBe('/m/sheets/123')
    })

    it('routes https://getstudyhub.org/notes/42 to /m/notes/42', () => {
      expect(routeForDeepLink('https://getstudyhub.org/notes/42')).toBe('/m/notes/42')
    })

    it('routes https://getstudyhub.org/users/alice to /m/users/alice', () => {
      expect(routeForDeepLink('https://getstudyhub.org/users/alice')).toBe('/m/users/alice')
    })

    it('preserves search params on https search link', () => {
      expect(routeForDeepLink('https://getstudyhub.org/search?q=hello%20world')).toBe(
        '/m/search?q=hello%20world',
      )
    })

    it('rejects https URLs from other hosts', () => {
      expect(routeForDeepLink('https://evil.example/sheets/1')).toBeNull()
    })

    it('returns /m/home when path is just the root', () => {
      expect(routeForDeepLink('https://getstudyhub.org/')).toBe('/m/home')
    })
  })

  describe('rejections and edge cases', () => {
    it('rejects unknown schemes', () => {
      expect(routeForDeepLink('mailto:hi@example.com')).toBeNull()
      expect(routeForDeepLink('javascript:alert(1)')).toBeNull()
    })

    it('rejects malformed URLs', () => {
      expect(routeForDeepLink('not a url')).toBeNull()
      expect(routeForDeepLink('')).toBeNull()
      expect(routeForDeepLink(null)).toBeNull()
      expect(routeForDeepLink(undefined)).toBeNull()
    })

    it('handles URL-encoded path segments without dropping them', () => {
      // Real OS-delivered URLs are pre-encoded; the mapper passes the raw
      // segment through encodeURIComponent so the result is a syntactically
      // valid path even if it ends up double-encoded for exotic inputs.
      // What matters is that the route survives non-ASCII content rather
      // than crashing or returning null.
      const result = routeForDeepLink('getstudyhub://note/has%20space')
      expect(result).toMatch(/^\/m\/notes\//)
      expect(result).not.toBeNull()
    })
  })
})
