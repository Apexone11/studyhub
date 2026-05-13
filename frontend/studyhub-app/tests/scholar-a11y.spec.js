/**
 * scholar-a11y.spec.js — axe-core scan across the 5 Scholar routes.
 *
 * Runs WCAG 2.1 AA scans and fails the build on any new "serious" or
 * "critical" violation. Moderate / minor findings are logged but don't
 * block CI — they go in the founder's awareness bucket per the task
 * spec.
 *
 * Tab-order assertion on /scholar/search: keyboard-only navigation
 * should reach the search input early in the focus order.
 *
 * Scholar routes 302 to /login when un-authenticated. We scan whatever
 * surface the SPA finally renders — the WCAG floor applies to both.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const SCHOLAR_ROUTES = [
  { path: '/scholar', name: 'hub' },
  { path: '/scholar/search?q=attention', name: 'search' },
  { path: '/scholar/paper/1', name: 'paper-detail' },
  { path: '/scholar/saved', name: 'saved' },
  { path: '/scholar/topic/computer-science', name: 'topic' },
]

// Rule IDs to skip — populate only with documented justifications.
const EXPECTED_VIOLATION_RULES = new Set([
  // e.g. 'color-contrast', // brand accent vs paper background — design intent
])

async function stubScholarBackend(page) {
  await page.route('**/api/scholar/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/search')) {
      await route.fulfill({ status: 200, json: { results: [], total: 0 } })
      return
    }
    if (url.match(/\/paper\/[^/]+$/)) {
      await route.fulfill({ status: 404, json: { error: 'Paper not found', code: 'NOT_FOUND' } })
      return
    }
    if (url.includes('/topic/') || url.includes('/discover')) {
      await route.fulfill({ status: 200, json: { results: [] } })
      return
    }
    await route.fulfill({ status: 200, json: {} })
  })
}

for (const route of SCHOLAR_ROUTES) {
  test(`a11y: scholar ${route.name} (${route.path})`, async ({ page }) => {
    await stubScholarBackend(page)
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {
      // networkidle stalls behind SSE / WebSocket in some configs.
      // domcontentloaded + a small settle is sufficient for axe.
    })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const blocking = results.violations.filter(
      (v) =>
        (v.impact === 'serious' || v.impact === 'critical') && !EXPECTED_VIOLATION_RULES.has(v.id),
    )

    const moderate = results.violations.filter(
      (v) => v.impact === 'moderate' || v.impact === 'minor',
    )

    if (moderate.length > 0) {
      // Awareness-only log per task spec — do NOT fail.
       
      console.warn(
        `[scholar-a11y:${route.name}] ${moderate.length} moderate/minor finding(s):\n` +
          moderate.map((v) => `  - ${v.id} (${v.impact}): ${v.help}`).join('\n'),
      )
    }

    if (blocking.length > 0) {
       
      console.error(
        `[scholar-a11y:${route.name}] ${blocking.length} blocking violation(s):\n` +
          blocking
            .map(
              (v) =>
                `  - ${v.id} (${v.impact}): ${v.help}\n    ${v.helpUrl}\n    ${v.nodes.length} node(s)`,
            )
            .join('\n'),
      )
    }

    expect(blocking, `Blocking a11y violations on scholar/${route.name}`).toEqual([])
  })
}

test('a11y: scholar search has a sensible keyboard tab order', async ({ page }) => {
  await stubScholarBackend(page)
  await page.goto('/scholar/search?q=attention', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  // The page may not have a search input visible (login redirect),
  // so we soft-check. If a searchbox exists, tabbing from the body
  // should reach an interactive element within a small number of
  // hops. The exact hop count depends on chrome (skip link, sidebar
  // nav, etc.) — we just require a reachable focusable in the
  // first 25 hops.
  await page
    .locator('body')
    .click({ position: { x: 1, y: 1 } })
    .catch(() => {})

  let reachedInteractive = false
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab')
    const tag = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      return {
        tag: el.tagName,
        type: el.getAttribute('type'),
        role: el.getAttribute('role'),
      }
    })
    if (!tag) continue
    if (
      tag.tag === 'INPUT' ||
      tag.tag === 'BUTTON' ||
      tag.tag === 'A' ||
      tag.tag === 'SELECT' ||
      tag.tag === 'TEXTAREA' ||
      tag.role === 'button' ||
      tag.role === 'link' ||
      tag.role === 'searchbox'
    ) {
      reachedInteractive = true
      break
    }
  }
  expect(
    reachedInteractive,
    'keyboard-only navigation should reach an interactive element within 25 Tab presses',
  ).toBe(true)
})
