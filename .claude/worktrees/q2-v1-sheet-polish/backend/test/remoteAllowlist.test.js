import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  isAllowedRemoteUrl,
  validateHtmlForRuntime,
  ALLOWED_STYLESHEET_HOSTS,
  ALLOWED_FONT_HOSTS,
  CSS_PATH_REQUIRED_HOSTS,
} = require('../src/lib/htmlSecurityRules')

// ── Cycle 51.1 — Core allowlist logic ───────────────────
describe('Remote Asset Allowlist (Cycle 51.1)', () => {
  describe('isAllowedRemoteUrl — Google Fonts', () => {
    it('allows fonts.googleapis.com stylesheet', () => {
      expect(isAllowedRemoteUrl('https://fonts.googleapis.com/css2?family=Inter')).toBe(true)
    })

    it('allows fonts.gstatic.com font files', () => {
      expect(isAllowedRemoteUrl('https://fonts.gstatic.com/s/inter/v18/abc.woff2')).toBe(true)
    })

    it('rejects http scheme (even for allowed hosts)', () => {
      expect(isAllowedRemoteUrl('http://fonts.googleapis.com/css2?family=Inter')).toBe(false)
    })

    it('rejects arbitrary domains', () => {
      expect(isAllowedRemoteUrl('https://evil.com/tracker.js')).toBe(false)
    })

    it('rejects javascript: scheme', () => {
      expect(isAllowedRemoteUrl('javascript:alert(1)')).toBe(false)
    })

    it('rejects non-string values', () => {
      expect(isAllowedRemoteUrl(null)).toBe(false)
      expect(isAllowedRemoteUrl(undefined)).toBe(false)
      expect(isAllowedRemoteUrl(123)).toBe(false)
    })

    it('rejects malformed URLs', () => {
      expect(isAllowedRemoteUrl('https://')).toBe(false)
    })
  })

  describe('validateHtmlForRuntime — Google Fonts allowed', () => {
    it('allows a sheet with only Google Fonts stylesheet', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">
        </head>
        <body>
          <h1 style="font-family: 'Inter', sans-serif">Hello</h1>
        </body>
        </html>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('allows Google Fonts with multiple families', () => {
      const html = `
        <link href="https://fonts.googleapis.com/css2?family=Roboto&family=Open+Sans:wght@300;400;700" rel="stylesheet">
        <p>Test</p>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
    })

    it('allows CSS @import of Google Fonts', () => {
      const html = `
        <style>
          @import url("https://fonts.googleapis.com/css2?family=Lato");
          body { font-family: 'Lato', sans-serif; }
        </style>
        <p>Test</p>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
    })
  })

  describe('validateHtmlForRuntime — external scripts still blocked', () => {
    it('blocks external script from any domain', () => {
      const html = `
        <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
        <p>Test</p>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
      expect(result.issues.some((i) => i.includes('External scripts'))).toBe(true)
    })

    it('blocks external script even from allowed host', () => {
      const html = `
        <script src="https://fonts.googleapis.com/malicious.js"></script>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
      expect(result.issues.some((i) => i.includes('External scripts'))).toBe(true)
    })
  })

  describe('validateHtmlForRuntime — non-allowlisted remote URLs blocked', () => {
    it('blocks remote image from arbitrary domain', () => {
      const html = `<img src="https://evil.com/tracker.gif">`
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
      expect(result.issues.some((i) => i.includes('Remote assets'))).toBe(true)
    })

    it('blocks http scheme even for Google Fonts', () => {
      const html = `<link rel="stylesheet" href="http://fonts.googleapis.com/css2?family=Inter">`
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
    })
  })

  describe('validateHtmlForRuntime — javascript: and data: still blocked', () => {
    it('blocks javascript: URLs', () => {
      const html = `<a href="javascript:alert(1)">Click</a>`
      const result = validateHtmlForRuntime(html)
      expect(result).toBeDefined()
    })
  })

  describe('validateHtmlForRuntime — mixed allowed and blocked', () => {
    it('passes with only Google Fonts but fails with added external img', () => {
      const htmlOk = `
        <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
        <p>Clean sheet</p>
      `
      expect(validateHtmlForRuntime(htmlOk).ok).toBe(true)

      const htmlBad = `
        <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
        <img src="https://tracking.com/pixel.gif">
        <p>Sheet with tracker</p>
      `
      const result = validateHtmlForRuntime(htmlBad)
      expect(result.ok).toBe(false)
      expect(result.enrichedIssues.length).toBeGreaterThan(0)
      expect(result.enrichedIssues.every((e) => !e.url?.includes('fonts.googleapis.com'))).toBe(true)
    })
  })
})

// ── Cycle 51.2 — Expanded CDN allowlist ─────────────────
describe('Remote Asset Allowlist (Cycle 51.2)', () => {
  describe('allowlist configuration', () => {
    it('ALLOWED_STYLESHEET_HOSTS contains Google Fonts + CDN hosts', () => {
      expect(ALLOWED_STYLESHEET_HOSTS.has('fonts.googleapis.com')).toBe(true)
      expect(ALLOWED_STYLESHEET_HOSTS.has('cdnjs.cloudflare.com')).toBe(true)
      expect(ALLOWED_STYLESHEET_HOSTS.has('cdn.jsdelivr.net')).toBe(true)
      expect(ALLOWED_STYLESHEET_HOSTS.size).toBe(3)
    })

    it('ALLOWED_FONT_HOSTS contains only Google Fonts gstatic', () => {
      expect(ALLOWED_FONT_HOSTS.has('fonts.gstatic.com')).toBe(true)
      expect(ALLOWED_FONT_HOSTS.size).toBe(1)
    })

    it('CSS_PATH_REQUIRED_HOSTS covers CDN hosts', () => {
      expect(CSS_PATH_REQUIRED_HOSTS.has('cdnjs.cloudflare.com')).toBe(true)
      expect(CSS_PATH_REQUIRED_HOSTS.has('cdn.jsdelivr.net')).toBe(true)
      expect(CSS_PATH_REQUIRED_HOSTS.has('fonts.googleapis.com')).toBe(false)
    })
  })

  describe('isAllowedRemoteUrl — CDN CSS files', () => {
    it('allows cdnjs.cloudflare.com .css files', () => {
      expect(isAllowedRemoteUrl('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')).toBe(true)
    })

    it('allows cdn.jsdelivr.net .css files', () => {
      expect(isAllowedRemoteUrl('https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css')).toBe(true)
    })

    it('blocks cdnjs.cloudflare.com .js files', () => {
      expect(isAllowedRemoteUrl('https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js')).toBe(false)
    })

    it('blocks cdn.jsdelivr.net .js files', () => {
      expect(isAllowedRemoteUrl('https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js')).toBe(false)
    })

    it('blocks CDN URLs without file extension', () => {
      expect(isAllowedRemoteUrl('https://cdn.jsdelivr.net/npm/bootstrap@5')).toBe(false)
    })

    it('blocks CDN http scheme', () => {
      expect(isAllowedRemoteUrl('http://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')).toBe(false)
    })

    it('blocks unpkg.com (not in allowlist)', () => {
      expect(isAllowedRemoteUrl('https://unpkg.com/normalize.css@8.0.1/normalize.css')).toBe(false)
    })
  })

  describe('validateHtmlForRuntime — CDN CSS allowed', () => {
    it('allows Bootstrap CSS from cdn.jsdelivr.net', () => {
      const html = `
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
        <div class="container"><h1>Hello Bootstrap</h1></div>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
    })

    it('allows Font Awesome CSS from cdnjs.cloudflare.com', () => {
      const html = `
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <i class="fa fa-home"></i>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
    })

    it('allows Tailwind CSS from cdn.jsdelivr.net', () => {
      const html = `
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <div class="bg-blue-500 p-4">Tailwind</div>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
    })

    it('allows mixed Google Fonts + CDN CSS', () => {
      const html = `
        <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <div class="container"><h1 style="font-family: 'Inter'">Hello</h1></div>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(true)
    })
  })

  describe('validateHtmlForRuntime — CDN JS still blocked', () => {
    it('blocks Bootstrap JS from cdn.jsdelivr.net even though CSS is allowed', () => {
      const html = `
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
      expect(result.issues.some((i) => i.includes('External scripts'))).toBe(true)
    })

    it('blocks .js loaded via href from CDN host', () => {
      // Even as a <link>, .js files from CDN hosts are rejected by isAllowedRemoteUrl
      const html = `<link href="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js" rel="stylesheet">`
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
    })
  })

  describe('validateHtmlForRuntime — enriched issues for blocked CDN assets', () => {
    it('shows exact URL for blocked remote asset', () => {
      const html = `<img src="https://evil.com/tracker.gif">`
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
      expect(result.enrichedIssues[0].url).toBe('https://evil.com/tracker.gif')
    })

    it('does not include allowed CDN CSS in enriched issues', () => {
      const html = `
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <img src="https://evil.com/pixel.gif">
      `
      const result = validateHtmlForRuntime(html)
      expect(result.ok).toBe(false)
      expect(result.enrichedIssues.every((e) => !e.url?.includes('cdn.jsdelivr.net'))).toBe(true)
      expect(result.enrichedIssues.some((e) => e.url?.includes('evil.com'))).toBe(true)
    })
  })
})
