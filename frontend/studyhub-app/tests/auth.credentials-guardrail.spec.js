/**
 * P0-4: Fetch credentials regression guardrail
 *
 * This test ensures every fetch() call to the StudyHub API includes
 * `credentials: 'include'`. Without this, session cookies are not sent
 * on the split-origin beta stack, silently breaking authentication.
 *
 * HOW IT WORKS:
 * - Traces API fetch() calls inside the page during real user flows
 * - Asserts each API fetch leaves the page with `credentials: 'include'`
 * - Covers: feed, sheets, search, upload, profile, dashboard, admin, sheetlab
 *
 * StudyHub installs a global fetch shim in `src/main.jsx` via
 * `installApiFetchShim()` from `src/lib/http.js`. This guardrail validates
 * that real contract directly instead of guessing from cookie headers.
 *
 * @tags @smoke @regression @auth
 */
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

/* ── Constants ──────────────────────────────────────────────────────── */

const API_PATTERN = /\/api\//

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

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

async function createCredentialsTracker(page) {
  await page.addInitScript(({ apiPatternSource, ignorePatternSources }) => {
    const apiPattern = new RegExp(apiPatternSource)
    const ignorePatterns = ignorePatternSources.map((source) => new RegExp(source, 'i'))

    window.__studyhubApiFetches = []

    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url
      const method = init?.method || (input instanceof Request ? input.method : 'GET')
      const credentials = init?.credentials || (input instanceof Request ? input.credentials : '')

      if (typeof url === 'string' && apiPattern.test(url) && !ignorePatterns.some((pattern) => pattern.test(url))) {
        window.__studyhubApiFetches.push({
          url,
          method: String(method || 'GET').toUpperCase(),
          credentials: credentials || '',
        })
      }

      return nativeFetch(input, init)
    }
  }, {
    apiPatternSource: API_PATTERN.source,
    ignorePatternSources: IGNORE_PATTERNS.map((pattern) => pattern.source),
  })

  return {
    getApiRequests: async () => page.evaluate(() => window.__studyhubApiFetches || []),
    assertNoViolations: async () => {
      const violations = await page.evaluate(() => {
        const calls = window.__studyhubApiFetches || []
        return calls
          .filter((call) => call.credentials !== 'include')
          .map((call) => ({
            url: call.url.replace(/^https?:\/\/[^/]+/, ''),
            method: call.method,
            credentials: call.credentials || '(empty)',
          }))
      })

      if (violations.length > 0) {
        const report = violations
          .map((violation) => `  ${violation.method} ${violation.url} [credentials=${violation.credentials}]`)
          .join('\n')
        throw new Error(
          `Found ${violations.length} API request(s) missing credentials: 'include':\n${report}\n\n` +
            'Fix: Add credentials: \'include\' to the fetch() options for each URL above.'
        )
      }
    },
  }
}

async function expectTrackedCredentialedRequests(tracker) {
  expect((await tracker.getApiRequests()).length).toBeGreaterThan(0)
  await tracker.assertNoViolations()
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

    const tracker = await createCredentialsTracker(page)

    await page.goto('/feed')
    await page.waitForTimeout(1000)

    const starBtn = page.locator('[data-testid="star-button"], button:has-text("Star")').first()
    if (await starBtn.isVisible().catch(() => false)) {
      await starBtn.click().catch(() => {})
    }

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all sheets page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    const tracker = await createCredentialsTracker(page)

    await page.goto('/sheets')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all sheet viewer API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockContributionDiff(page)

    const tracker = await createCredentialsTracker(page)

    await page.goto('/sheets/501')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all dashboard API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    const tracker = await createCredentialsTracker(page)

    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all profile page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockUserProfileEndpoints(page, 'public_user')

    const tracker = await createCredentialsTracker(page)

    await page.goto('/users/public_user')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all SheetLab API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockSheetLabEndpoints(page)

    const tracker = await createCredentialsTracker(page)

    await page.goto('/sheets/501/lab')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all admin page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    const tracker = await createCredentialsTracker(page)

    await page.goto('/admin')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('all announcements page API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)

    await page.route('**/api/announcements', async (route) => {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: 1,
            title: 'Welcome',
            body: 'Hello everyone!',
            pinned: false,
            createdAt: '2026-03-16T12:00:00.000Z',
            author: { id: 1, username: 'admin' },
          },
        ],
      })
    })

    const tracker = await createCredentialsTracker(page)

    await page.goto('/announcements')
    await page.waitForTimeout(1000)

    await expectTrackedCredentialedRequests(tracker)
  })

  test('search modal API requests include credentials', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await mockSearchEndpoints(page)

    const tracker = await createCredentialsTracker(page)

    await page.goto('/sheets')
    await page.waitForTimeout(500)

    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('recursion')
      await page.waitForTimeout(500)
    }

    await expectTrackedCredentialedRequests(tracker)
  })
})
