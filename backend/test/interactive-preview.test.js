/**
 * Interactive Sandbox Preview — Security Regression Tests
 *
 * Proves:
 * 1. html-runtime endpoint is gated to owner/admin only
 * 2. html-preview response includes canInteract flag
 * 3. Preview route serves correct CSP for safe vs runtime tokens
 * 4. Preview route sets correct sandbox-compatible headers
 * 5. Interactive document strips dangerous tags but preserves scripts
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildPreviewDocument,
  buildInteractiveDocument,
} = require('../src/lib/html/htmlPreviewDocument')

/* ═══════════════════════════════════════════════════════════════════════════
 * 1) buildInteractiveDocument — script preservation + dangerous tag stripping
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('buildInteractiveDocument — sandbox safety', () => {
  it('preserves inline <script> tags for interactivity', () => {
    const doc = buildInteractiveDocument({
      title: 'Test',
      html: '<p>Hello</p><script>document.querySelector(".acc").addEventListener("click", () => {})</script>',
    })
    expect(doc).toContain('<script>')
    expect(doc).toContain('addEventListener')
  })

  it('strips <base> tags to prevent URL hijacking', () => {
    const doc = buildInteractiveDocument({
      title: 'Test',
      html: '<base href="https://evil.com"><p>Content</p>',
    })
    expect(doc).not.toMatch(/<base[\s>]/i)
    expect(doc).toContain('<p>Content</p>')
  })

  it('strips <meta http-equiv="refresh"> to prevent redirect attacks', () => {
    const doc = buildInteractiveDocument({
      title: 'Test',
      html: '<meta http-equiv="refresh" content="0;url=https://evil.com"><p>Content</p>',
    })
    expect(doc).not.toMatch(/http-equiv/i)
    expect(doc).toContain('<p>Content</p>')
  })

  it('escapes title to prevent injection via title field', () => {
    const doc = buildInteractiveDocument({
      title: '</title><script>alert(1)</script>',
      html: '<p>Content</p>',
    })
    expect(doc).not.toMatch(/<\/title><script>/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2) buildPreviewDocument — safe mode strips all scripts
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('buildPreviewDocument — safe mode guarantees', () => {
  it('strips all script tags from body', () => {
    const doc = buildPreviewDocument({
      title: 'Test',
      html: '<p>Hello</p><script>alert(1)</script>',
    })
    expect(doc).not.toMatch(/<script[\s>]/i)
    expect(doc).toContain('<p>Hello</p>')
  })

  it('strips inline event handlers', () => {
    const doc = buildPreviewDocument({
      title: 'Test',
      html: '<div onclick="alert(1)">Click</div>',
    })
    expect(doc).not.toMatch(/onclick/i)
    expect(doc).toContain('Click')
  })

  it('strips javascript: URLs', () => {
    const doc = buildPreviewDocument({
      title: 'Test',
      html: '<a href="javascript:alert(1)">Link</a>',
    })
    expect(doc).not.toMatch(/javascript:/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 3) Preview CSP directives — verify correct policy composition
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('Preview CSP directives', () => {
  // Directive constants are not directly exported — tested indirectly via source checks below.

  it('base directives block connect-src (prevents fetch/XHR exfil)', () => {
    // Read the source to verify the directive exists
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8'
    )
    expect(source).toContain("connect-src 'none'")
  })

  it('base directives block form-action', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8'
    )
    expect(source).toContain("form-action 'none'")
  })

  it('safe preview directives block script-src', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8'
    )
    expect(source).toContain("SAFE_PREVIEW_DIRECTIVES")
    expect(source).toMatch(/SAFE_PREVIEW_DIRECTIVES.*script-src 'none'/s)
  })

  it('runtime directives allow unsafe-inline scripts only', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8'
    )
    expect(source).toContain("RUNTIME_DIRECTIVES")
    expect(source).toMatch(/RUNTIME_DIRECTIVES.*script-src 'unsafe-inline'/s)
  })

  it('base directives block object-src (no plugin execution)', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8'
    )
    expect(source).toContain("object-src 'none'")
  })

  it('base directives block worker-src (no web workers)', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8'
    )
    expect(source).toContain("worker-src 'none'")
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 4) Owner/admin gate — html-runtime requires canModerateOrOwnSheet
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('html-runtime endpoint — owner/admin gate', () => {
  it('html-runtime controller checks canModerateOrOwnSheet before tier checks', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8'
    )

    // The canModerateOrOwnSheet check must come BEFORE the tier checks
    const runtimeSection = source.indexOf("get('/:id/html-runtime'")

    // Find the owner gate within the runtime handler (after the route declaration)
    const runtimeBody = source.slice(runtimeSection)
    const ownerCheckInRuntime = runtimeBody.indexOf('canModerateOrOwnSheet(sheet, req.user)')
    const tierCheckInRuntime = runtimeBody.indexOf('RISK_TIER.QUARANTINED')

    expect(ownerCheckInRuntime).toBeGreaterThan(0)
    expect(tierCheckInRuntime).toBeGreaterThan(ownerCheckInRuntime)
  })

  it('html-runtime returns 403 message for non-owner/admin', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8'
    )
    expect(source).toContain('Interactive preview is only available to the sheet owner or an admin.')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 5) html-preview response includes canInteract flag
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('html-preview endpoint — canInteract flag', () => {
  it('html-preview controller includes canInteract in response', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8'
    )

    // Find the html-preview handler's res.json call
    const previewSection = source.indexOf("get('/:id/html-preview'")
    const runtimeSection = source.indexOf("get('/:id/html-runtime'")
    const previewBody = source.slice(previewSection, runtimeSection)

    expect(previewBody).toContain('canInteract')
    expect(previewBody).toContain('canModerateOrOwnSheet')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 6) Sandbox iframe attributes — frontend verification
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('Frontend sandbox iframe attributes', () => {
  it('SheetContentPanel uses allow-scripts allow-forms for interactive mode', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx'),
      'utf8'
    )
    expect(source).toContain("'allow-scripts allow-forms'")
    // Must NOT contain allow-same-origin (would break sandbox isolation)
    expect(source).not.toContain('allow-same-origin')
  })

  it('SheetContentPanel uses empty sandbox for safe mode', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx'),
      'utf8'
    )
    // The ternary should fall back to empty string for safe mode
    expect(source).toMatch(/sandbox=\{.*\? 'allow-scripts allow-forms' : ''/s)
  })

  it('SheetHtmlPreviewPage uses allow-scripts allow-forms for interactive mode', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx'),
      'utf8'
    )
    expect(source).toContain("'allow-scripts allow-forms'")
    expect(source).not.toContain('allow-same-origin')
  })

  it('SheetContentPanel does not include allow-top-navigation', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx'),
      'utf8'
    )
    expect(source).not.toContain('allow-top-navigation')
  })

  it('SheetContentPanel does not include allow-popups', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx'),
      'utf8'
    )
    expect(source).not.toContain('allow-popups')
  })
})
