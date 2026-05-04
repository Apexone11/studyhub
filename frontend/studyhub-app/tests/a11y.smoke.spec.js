/**
 * Accessibility smoke (axe-core) — runs WCAG 2.1 AA scans against the
 * highest-traffic public pages and fails the build on any new "serious"
 * or "critical" violations.
 *
 * Scope is intentionally narrow today: HomePage, LoginPage, RegisterPage,
 * legal pages. Auth-gated pages need a beta seed which the standard
 * Playwright config doesn't run, so they're tagged for future expansion.
 *
 * If a violation is a known false positive (e.g. third-party iframe we
 * can't fix), add the rule ID to `EXPECTED_VIOLATION_RULES` with a
 * one-line justification.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const EXPECTED_VIOLATION_RULES = new Set([
  // Add rule IDs here when a violation is genuinely out of our control,
  // with a comment explaining why. Example:
  //   'color-contrast', // landing hero gradient uses brand token; contrast is intentional design
])

const PUBLIC_PAGES = [
  { path: '/', name: 'home' },
  { path: '/login', name: 'login' },
  { path: '/register', name: 'register' },
  { path: '/terms', name: 'terms' },
  { path: '/privacy', name: 'privacy' },
  { path: '/cookies', name: 'cookies' },
  { path: '/disclaimer', name: 'disclaimer' },
  { path: '/data-request', name: 'data-request' },
  { path: '/about', name: 'about' },
  { path: '/pricing', name: 'pricing' },
  // L4-LOW-4 + L8: Hub AI + Scholar landings include public-facing
  // surfaces (sign-in modal, marketing copy) that pre-auth users hit
  // when navigating from the marketing site. The live pages 302 to
  // /login when un-authenticated, so axe scans the login surface here
  // — we still want WCAG-clean unauth states.
  { path: '/ai', name: 'ai-public' },
  { path: '/scholar', name: 'scholar-public' },
  { path: '/library', name: 'library-public' },
]

for (const page of PUBLIC_PAGES) {
  test(`a11y: ${page.name} (${page.path})`, async ({ page: pwPage }) => {
    await pwPage.goto(page.path)
    // Give React a beat to mount everything.
    await pwPage.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page: pwPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const blocking = results.violations.filter(
      (v) =>
        (v.impact === 'serious' || v.impact === 'critical') && !EXPECTED_VIOLATION_RULES.has(v.id),
    )

    if (blocking.length > 0) {
      console.error(
        `[a11y:${page.name}] ${blocking.length} blocking violation(s):\n` +
          blocking
            .map(
              (v) =>
                `  - ${v.id} (${v.impact}): ${v.help}\n    ${v.helpUrl}\n    ${v.nodes.length} node(s)`,
            )
            .join('\n'),
      )
    }

    expect(blocking, `Blocking a11y violations on ${page.name}`).toEqual([])
  })
}
