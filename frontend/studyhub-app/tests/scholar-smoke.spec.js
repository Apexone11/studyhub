/**
 * scholar-smoke.spec.js — Public-facing smoke for Scholar routes.
 *
 * Scholar is auth-gated (`requireAuth` + `requireFeatureFlag` on
 * /api/scholar/*). Un-authenticated visitors get redirected to /login
 * by the SPA. We do NOT try to log in here — the smoke pass asserts:
 *
 *   1. Each Scholar route reaches a stable surface (Scholar page OR
 *      the login redirect target) without a thrown error boundary
 *      and without a 500 response.
 *   2. An <h1> exists on the rendered page (a11y / SEO floor).
 *   3. No console errors of severity 'error' fire during navigation.
 *
 * Auth-gated content (search results, paper details) is covered in the
 * vitest unit tests; this spec defends the routing + crash invariants
 * that other agents shipping Scholar redesigns could regress.
 */
import { expect, test } from '@playwright/test'

const SCHOLAR_ROUTES = [
  { path: '/scholar', name: 'hub' },
  { path: '/scholar/search?q=attention', name: 'search' },
  { path: '/scholar/paper/1', name: 'paper-detail' },
  { path: '/scholar/saved', name: 'saved' },
  { path: '/scholar/topic/computer-science', name: 'topic' },
]

// Console errors we are willing to tolerate. Empty by default — add
// entries only when an upstream library (e.g. third-party SDK) emits
// noise we cannot suppress.
const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i,
  /Failed to load resource.*\.svg/i,
  // React-Router future-flag advisory; informational, not a defect.
  /v7_startTransition|v7_relativeSplatPath/i,
]

async function stubScholarBackend(page) {
  // Generic stub: shape-only. Other Scholar agents will wire the real
  // endpoints — this stub keeps the smoke pass green when run without
  // a live backend. Each handler returns 200 + an empty / minimal
  // payload that the page-level "empty state" path can render.
  await page.route('**/api/scholar/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/search')) {
      await route.fulfill({ status: 200, json: { results: [], total: 0 } })
      return
    }
    if (url.includes('/paper/') && url.includes('/citations')) {
      await route.fulfill({ status: 200, json: { results: [], total: 0 } })
      return
    }
    if (url.includes('/paper/') && url.includes('/references')) {
      await route.fulfill({ status: 200, json: { results: [], total: 0 } })
      return
    }
    if (url.match(/\/paper\/[^/]+$/)) {
      // Unknown paper id → 404 is a legitimate response. The page
      // should render a "not found" surface, not crash.
      await route.fulfill({ status: 404, json: { error: 'Paper not found', code: 'NOT_FOUND' } })
      return
    }
    if (url.includes('/topic/')) {
      await route.fulfill({ status: 200, json: { results: [], slug: 'computer-science' } })
      return
    }
    if (url.includes('/discover')) {
      await route.fulfill({ status: 200, json: { results: [] } })
      return
    }
    if (url.includes('/save')) {
      await route.fulfill({ status: 200, json: { saved: [] } })
      return
    }
    // Default fallthrough — empty success.
    await route.fulfill({ status: 200, json: {} })
  })
}

for (const route of SCHOLAR_ROUTES) {
  test(`scholar smoke: ${route.name} (${route.path}) renders without crash`, async ({ page }) => {
    const consoleErrors = []
    const failedRequests = []

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return
      consoleErrors.push(text)
    })
    page.on('response', (resp) => {
      if (resp.status() >= 500) {
        failedRequests.push(`${resp.status()} ${resp.url()}`)
      }
    })

    await stubScholarBackend(page)

    const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    // The SPA may redirect to /login when unauth; either way we should
    // not see a 500 from the page route itself.
    expect(response?.status() ?? 200).toBeLessThan(500)

    await page.waitForLoadState('networkidle').catch(() => {
      // networkidle can stall when SSE / WebSocket is mocked. Don't
      // fail the smoke on that — we already have domcontentloaded.
    })

    // At least one <h1> exists. We do not assert its exact text —
    // login redirect and the Scholar page both satisfy this floor.
    const h1Count = await page.locator('h1').count()
    expect(h1Count, `${route.name}: page should render at least one <h1>`).toBeGreaterThanOrEqual(1)

    // No 5xx responses fired during the render.
    expect(failedRequests, `${route.name}: 5xx responses observed`).toEqual([])

    // No fatal console errors during the render. We don't fail on
    // warnings, only console.error calls — those usually indicate a
    // React render crash or unhandled rejection.
    expect(consoleErrors, `${route.name}: console errors observed`).toEqual([])
  })
}

test('scholar search route accepts q= without throwing and within 5 seconds', async ({ page }) => {
  await stubScholarBackend(page)
  const start = Date.now()
  await page.goto('/scholar/search?q=attention', { waitUntil: 'domcontentloaded' })
  const elapsed = Date.now() - start
  expect(elapsed, 'scholar/search?q= initial render should be under 5s').toBeLessThan(5000)
})

test('scholar paper detail route handles unknown id cleanly', async ({ page }) => {
  await stubScholarBackend(page)
  await page.goto('/scholar/paper/1', { waitUntil: 'domcontentloaded' })
  // We assert NOT a crash, not a specific copy: a 404 surface or a
  // login redirect both satisfy. The body must be present.
  await expect(page.locator('body')).toBeVisible()
})
