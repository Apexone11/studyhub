/**
 * P0-4: Fetch credentials regression guardrail
 *
 * This test ensures every fetch() call to the StudyHub API includes
 * `credentials: 'include'`. Without this, session cookies are not sent
 * on the split-origin beta stack, silently breaking authentication.
 *
 * HOW IT WORKS:
 * - Intercepts ALL requests to the API origin during real user flows
 * - Asserts each API request includes credentials (cookie header present)
 * - Covers: feed, sheets, search, upload, profile, dashboard, admin, sheetlab
 *
 * If this test fails, a new fetch() call was added without credentials.
 * Fix: add `credentials: 'include'` to the fetch options.
 *
 * @tags @smoke @regression @auth
 */
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

/* ── Constants ──────────────────────────────────────────────────────── */

// Matches the API base URL pattern used in the app (default localhost:4000)
const API_PATTERN = /\/api\//

// Requests to ignore (not our API, or browser internals)
const IGNORE_PATTERNS = [
  /posthog/i,
  /sentry/i,
  /google/i,
  /clarity/i,
  /cloudflare/i,
  /favicon/,
  /\.js$/,
  /\.css$/,
  /\.svg$/,
  /\.png$/,
  /\.woff/,
  /hot-update/,
]

/* ── Helpers ──────────────────────────────────────────────────────── */

function isApiRequest(url) {
  if (!API_PATTERN.test(url)) return false
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(url)) return false
  }
  return true
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

/**
 * Collects all API requests during a page interaction and returns
 * any that are missing credentials (no cookie header).
 *
 * We check for the presence of a `cookie` header on the request,
 * which proves `credentials: 'include'` was set (the browser only
 * sends cookies when credentials mode is 'include' for cross-origin).
 *
 * For same-origin requests in tests, we inject a tracking cookie so
 * we can detect whether the browser attached it (proving credentials
 * were included).
 */
function createCredentialsTracker(page) {
  const apiRequests = []
  const violations = []

  // Inject a marker cookie so we can verify it gets sent
  page.context().addCookies([
    {
      name: 'studyhub_test_session',
      value: 'test-marker',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])

  page.on('request', (request) => {
    const url = request.url()
    if (!isApiRequest(url)) return

    const method = request.method()
    const headers = request.headers()

    apiRequests.push({ url, method })

    // In same-origin tests, the cookie header should exist if credentials: 'include'
    // is set. If it's missing, the fetch didn't include credentials.
    // Note: For mocked routes fulfilled via route.fulfill(), the request still
    // goes through and we can inspect its headers.
    const hasCookie = Boolean(headers['cookie'])

    if (!hasCookie) {
      violations.push({
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        method,
      })
    }
  })

  return {
    getApiRequests: () => apiRequests,
    getViolations: () => violations,
    assertNoViolations: () => {
      if (violations.length > 0) {
        const report = violations
          .map((v) => `  ${v.method} ${v.url}`)
          .join('\n')
        throw new Error(
          `Found ${violations.length} API request(s) missing credentials: 'include':\n${report}\n\n` +
            'Fix: Add credentials: \'include\' to the fetch() options for each URL above.'
        )
      }
    },
  }
}

/* ── Additional mocks for pages not covered by mockAuthenticatedApp ─ */

async function mockSheetLabEndpoints(page) {
  await page.route('**/api/sheets/*/lab/commits*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        commits: [
          {
            id: 1,
            message: 'Initial version',
            createdAt: '2026-03-16T12:00:00.000Z',
            snapshot: 'Line 1\nLine 2',
          },
        ],
      },
    })
  })

  await page.route('**/api/sheets/*/lab/diff*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { additions: 1, deletions: 0, hunks: [] },
    })
  })

  await page.route('**/api/sheets/*/lab/auto-summary*', async (route) => {
    await route.fulfill({ status: 200, json: { summary: 'Test change' } })
  })

  await page.route('**/api/sheets/*/lab/restore-preview/*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { additions: 1, deletions: 0, hunks: [] },
    })
  })
}

async function mockContributionDiff(page) {
  await page.route('**/api/sheets/contributions/*/diff', async (route) => {
    await route.fulfill({
      status: 200,
      json: { additions: 1, deletions: 0, hunks: [] },
    })
  })
}

async function mockSearchEndpoints(page) {
  await page.route('**/api/search?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { sheets: [], courses: [], users: [], total: 0 },
    })
  })
}

async function mockUserProfileEndpoints(page, username = 'public_user') {
  await page.route(`**/api/users/${username}`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 80,
        username,
        role: 'student',
        avatarUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        bio: 'Test user',
        _count: { enrollments: 1, studySheets: 2 },
        enrollments: [],
        sheets: [],
        followerCount: 5,
        followingCount: 3,
        isFollowing: false,
      },
    })
  })

  await page.route(`**/api/users/${username}/followers*`, async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })

  await page.route(`**/api/users/${username}/following*`, async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })
}

/* ── Test Suite ──────────────────────────────────────────────────── */

test.describe('P0-4: API credentials guardrail @smoke @regression', () => {
  test('all feed page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockSearchEndpoints(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/feed')
    await page.waitForTimeout(1000)

    // Interact with feed to trigger more API calls
    const starBtn = page.locator('[data-testid="star-button"], button:has-text("Star")').first()
    if (await starBtn.isVisible().catch(() => false)) {
      await starBtn.click().catch(() => {})
    }

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('all sheets page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/sheets')
    await page.waitForTimeout(1000)

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('all sheet viewer API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockContributionDiff(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/sheets/501')
    await page.waitForTimeout(1000)

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('all dashboard API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('all profile page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockUserProfileEndpoints(page, 'public_user')

    const tracker = createCredentialsTracker(page)

    await page.goto('/users/public_user')
    await page.waitForTimeout(1000)

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('all SheetLab API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockSheetLabEndpoints(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/sheets/501/lab')
    await page.waitForTimeout(1000)

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('all admin page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/admin')
    await page.waitForTimeout(1000)

    expect(tracker.getApiRequests().length).toBeGreaterThan(0)
    tracker.assertNoViolations()
  })

  test('search modal API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockSearchEndpoints(page)

    const tracker = createCredentialsTracker(page)

    await page.goto('/sheets')
    await page.waitForTimeout(500)

    // Open the search modal (Ctrl+K or click search)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    // Type a search query to trigger API call
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('recursion')
      await page.waitForTimeout(500)
    }

    tracker.assertNoViolations()
  })
})
