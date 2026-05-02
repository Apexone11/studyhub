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
      'utf8',
    )
    expect(source).toContain("connect-src 'none'")
  })

  it('base directives block form-action', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8',
    )
    expect(source).toContain("form-action 'none'")
  })

  it('safe preview directives block script-src', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8',
    )
    expect(source).toContain('SAFE_PREVIEW_DIRECTIVES')
    expect(source).toMatch(/SAFE_PREVIEW_DIRECTIVES.*script-src 'none'/s)
  })

  it('runtime directives allow unsafe-inline scripts only', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8',
    )
    expect(source).toContain('RUNTIME_DIRECTIVES')
    expect(source).toMatch(/RUNTIME_DIRECTIVES.*script-src 'unsafe-inline'/s)
  })

  it('base directives block object-src (no plugin execution)', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8',
    )
    expect(source).toContain("object-src 'none'")
  })

  it('base directives block worker-src (no web workers)', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/preview/preview.routes.js'),
      'utf8',
    )
    expect(source).toContain("worker-src 'none'")
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 4) Owner/admin gate — html-runtime requires canModerateOrOwnSheet for
 *    HIGH_RISK (Tier 2) and QUARANTINED (Tier 3). Tier 0 (CLEAN) and Tier 1
 *    (FLAGGED) are publish-and-show for any authenticated viewer.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('html-runtime endpoint — owner/admin gate', () => {
  it('html-runtime controller checks canModerateOrOwnSheet for HIGH_RISK before quarantine check', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8',
    )

    // The canModerateOrOwnSheet check must come BEFORE the quarantine tier check
    const runtimeSection = source.indexOf("get('/:id/html-runtime'")

    // Find the owner gate within the runtime handler (after the route declaration)
    const runtimeBody = source.slice(runtimeSection)
    const ownerCheckInRuntime = runtimeBody.indexOf('canModerateOrOwnSheet(sheet, req.user)')
    const tierCheckInRuntime = runtimeBody.indexOf('RISK_TIER.QUARANTINED')

    expect(ownerCheckInRuntime).toBeGreaterThan(0)
    expect(tierCheckInRuntime).toBeGreaterThan(ownerCheckInRuntime)
  })

  it('html-runtime returns 403 message for non-owner/admin on HIGH_RISK sheets', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8',
    )
    expect(source).toContain(
      'Interactive preview for high-risk sheets is only available to the sheet owner or an admin.',
    )
  })

  it('html-runtime gates owner-only on HIGH_RISK (Tier 2) — Tier 1 stays open for all authenticated viewers', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8',
    )
    const runtimeSection = source.indexOf("get('/:id/html-runtime'")
    const runtimeBody = source.slice(runtimeSection)
    // The publish-with-warning policy (CLAUDE.md HTML Security Policy) means
    // Tier 1 (FLAGGED) sheets ARE viewable + interactive for everyone, with
    // the warning shown in the UI. Owner-only restriction kicks in at Tier 2
    // (HIGH_RISK). Regression-guard against re-tightening the gate to FLAGGED.
    expect(runtimeBody).toContain('RISK_TIER.HIGH_RISK')
    expect(runtimeBody).not.toMatch(/tier\s*>=\s*RISK_TIER\.FLAGGED\s*&&\s*!canModerateOrOwnSheet/)
  })

  it('html-preview canInteract opens Tier 0 + Tier 1 to all authenticated users', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(__dirname, '../src/modules/sheets/sheets.html.controller.js'),
      'utf8',
    )
    const previewSection = source.indexOf("get('/:id/html-preview'")
    const runtimeSection = source.indexOf("get('/:id/html-runtime'")
    const previewBody = source.slice(previewSection, runtimeSection)
    // canInteract must use `tier <= RISK_TIER.FLAGGED` (Tier 0 OR Tier 1
    // open to all authed) — NOT `tier < RISK_TIER.FLAGGED` (Tier 0 only).
    expect(previewBody).toMatch(/tier\s*<=\s*RISK_TIER\.FLAGGED/)
    expect(previewBody).not.toMatch(/tier\s*<\s*RISK_TIER\.FLAGGED\b/)
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
      'utf8',
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
  // Helper: read a frontend source file relative to the repo root.
  const readSource = (relPath) => {
    const fs = require('node:fs')
    const path = require('node:path')
    return fs.readFileSync(
      path.join(__dirname, '../../frontend/studyhub-app/src/', relPath),
      'utf8',
    )
  }

  // Two iframes live in the codebase, one in the sheet viewer and one in
  // the dedicated HTML preview page. Both must follow the same two-mode
  // sandbox policy: interactive runtime gets `allow-scripts allow-forms`
  // (NEVER combined with allow-same-origin), and safe preview gets
  // `allow-same-origin` alone (so cross-subdomain Chrome renders it
  // instead of showing the "(blocked:origin)" placeholder). These rules
  // apply identically across the two surfaces.
  const SANDBOX_BEARING_FILES = [
    'pages/sheets/viewer/SheetContentPanel.jsx',
    'pages/preview/SheetHtmlPreviewPage.jsx',
  ]

  for (const relPath of SANDBOX_BEARING_FILES) {
    describe(`sandbox policy in ${relPath}`, () => {
      it('grants allow-scripts allow-forms in the interactive branch', () => {
        const source = readSource(relPath)
        expect(source).toContain("'allow-scripts allow-forms'")
      })

      it('grants allow-same-origin (and ONLY allow-same-origin) in the safe-preview branch', () => {
        const source = readSource(relPath)
        // Regression guard: an empty sandbox attribute on a cross-origin
        // iframe makes Chrome show "(blocked:origin)" instead of content.
        // The safe-preview branch of the sandbox ternary must hand the
        // iframe an explicit 'allow-same-origin' literal — not '', not
        // 'allow-same-origin allow-popups' (broader privilege), and never
        // anything containing allow-scripts (privilege escalation).
        //
        // Match the safe branch directly: `: 'allow-...'`. We capture the
        // string literal so we can assert it equals exactly
        // 'allow-same-origin'. This makes the test fail loudly if a
        // future change quietly widens the safe-branch privilege set.
        const safeBranchMatch = source.match(
          /\?\s*['"]allow-scripts allow-forms['"]\s*:\s*(['"])([^'"]*)\1/,
        )
        expect(safeBranchMatch, 'safe-preview ternary not found').toBeTruthy()
        const safeBranchValue = safeBranchMatch[2]
        expect(safeBranchValue).toBe('allow-same-origin')
      })

      it('never combines allow-scripts with allow-same-origin in one sandbox literal', () => {
        const source = readSource(relPath)
        // The interactive branch is the one running author-supplied
        // scripts. Granting allow-same-origin there would let those
        // scripts read the parent app's cookies/storage. Reject any
        // quoted string literal that pairs the two tokens in either
        // order. Comment prose can still mention either token.
        expect(source).not.toMatch(/['"]allow-scripts[^'"]*allow-same-origin[^'"]*['"]/)
        expect(source).not.toMatch(/['"]allow-same-origin[^'"]*allow-scripts[^'"]*['"]/)
      })
    })
  }

  it('SheetContentPanel does not include allow-top-navigation', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../frontend/studyhub-app/src/pages/sheets/viewer/SheetContentPanel.jsx',
      ),
      'utf8',
    )
    expect(source).not.toContain('allow-top-navigation')
  })

  it('SheetContentPanel does not include allow-popups', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../frontend/studyhub-app/src/pages/sheets/viewer/SheetContentPanel.jsx',
      ),
      'utf8',
    )
    expect(source).not.toContain('allow-popups')
  })
})
