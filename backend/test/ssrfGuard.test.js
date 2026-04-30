import { describe, it, expect } from 'vitest'

const { assertSafeOutboundUrl } = await import('../src/lib/ssrfGuard.js')

describe('ssrfGuard.assertSafeOutboundUrl', () => {
  describe('rejects malformed input', () => {
    it('rejects empty string', () => {
      expect(() => assertSafeOutboundUrl('')).toThrow(/non-empty string/)
    })
    it('rejects non-string', () => {
      expect(() => assertSafeOutboundUrl(null)).toThrow(/non-empty string/)
      expect(() => assertSafeOutboundUrl(123)).toThrow(/non-empty string/)
    })
    it('rejects unparseable URLs', () => {
      expect(() => assertSafeOutboundUrl('not a url')).toThrow(/parseable/)
    })
  })

  describe('rejects unsafe schemes', () => {
    it('rejects file://', () => {
      expect(() => assertSafeOutboundUrl('file:///etc/passwd')).toThrow(/scheme/)
    })
    it('rejects gopher://', () => {
      expect(() => assertSafeOutboundUrl('gopher://example.com')).toThrow(/scheme/)
    })
    it('rejects javascript:', () => {
      expect(() => assertSafeOutboundUrl('javascript:alert(1)')).toThrow(/scheme/)
    })
    it('rejects data:', () => {
      expect(() => assertSafeOutboundUrl('data:text/html,<h1>hi</h1>')).toThrow(/scheme/)
    })
  })

  describe('rejects credential-bearing URLs', () => {
    it('rejects user:pass in URL', () => {
      expect(() => assertSafeOutboundUrl('https://user:pass@arxiv.org/abs/1')).toThrow(
        /credentials/,
      )
    })
  })

  describe('rejects private IPv4 ranges (SSRF surface)', () => {
    const privateIps = [
      'http://127.0.0.1/',
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/', // AWS / GCP metadata service
      'http://0.0.0.0/',
    ]
    for (const url of privateIps) {
      it(`rejects ${url}`, () => {
        expect(() => assertSafeOutboundUrl(url)).toThrow()
      })
    }
  })

  describe('rejects bare-decimal and IPv4-mapped IPv6 SSRF tricks', () => {
    // Node's URL parser normalises these to dotted-quad IPv4 already, so
    // they hit the standard IPv4 deny list — confirm that path catches them.
    it('rejects http://0/ (bare decimal hostname → 0.0.0.0)', () => {
      expect(() => assertSafeOutboundUrl('http://0/')).toThrow(/private IPv4/)
    })
    it('rejects http://2130706433/ (decimal-encoded 127.0.0.1)', () => {
      expect(() => assertSafeOutboundUrl('http://2130706433/')).toThrow(/private IPv4/)
    })
    it('rejects IPv4-mapped IPv6 loopback (compact hex form)', () => {
      // Node compacts ::ffff:127.0.0.1 to ::ffff:7f00:1 in the URL hostname.
      expect(() => assertSafeOutboundUrl('http://[::ffff:127.0.0.1]/')).toThrow(/IPv4-mapped/)
    })
    it('rejects IPv4-mapped IPv6 metadata-service (compact hex form)', () => {
      expect(() => assertSafeOutboundUrl('http://[::ffff:169.254.169.254]/')).toThrow(/IPv4-mapped/)
    })
  })

  describe('rejects localhost', () => {
    it('rejects localhost', () => {
      expect(() => assertSafeOutboundUrl('http://localhost/admin')).toThrow(/localhost/)
    })
  })

  describe('allowlist enforcement', () => {
    it('rejects hosts outside the default allowlist', () => {
      expect(() => assertSafeOutboundUrl('https://evil.example.com/page')).toThrow(/allowlist/)
    })

    it('allows arxiv.org', () => {
      const url = assertSafeOutboundUrl('https://arxiv.org/abs/2001.00001')
      expect(url.hostname).toBe('arxiv.org')
    })

    it('allows subdomains of allowlisted hosts', () => {
      const url = assertSafeOutboundUrl('https://cdn.arxiv.org/static/foo.pdf')
      expect(url.hostname).toBe('cdn.arxiv.org')
    })

    it('respects per-call allowlist override', () => {
      const url = assertSafeOutboundUrl('https://example.com/foo', {
        allowlist: ['example.com'],
      })
      expect(url.hostname).toBe('example.com')
    })

    it('rejects host that only partially matches an allowlisted suffix', () => {
      // "evilarxiv.org" is NOT a subdomain of "arxiv.org"
      expect(() =>
        assertSafeOutboundUrl('https://evilarxiv.org/page', { allowlist: ['arxiv.org'] }),
      ).toThrow(/allowlist/)
    })
  })

  describe('happy path returns parsed URL', () => {
    it('returns a URL instance', () => {
      const url = assertSafeOutboundUrl('https://doi.org/10.1234/abc')
      expect(url).toBeInstanceOf(URL)
      expect(url.protocol).toBe('https:')
    })
  })
})
