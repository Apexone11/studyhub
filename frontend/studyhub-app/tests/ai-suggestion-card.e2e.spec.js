/**
 * ai-suggestion-card.e2e.spec.js — Phase 3 of v2 design refresh.
 *
 * Drives the AiSuggestionCard end-to-end on the UserProfilePage
 * Overview tab. Same harness pattern as upcoming-exams.e2e.spec.js
 * (mockAuthenticatedApp + mockProfileRoutes for follow-suggestions
 * etc.) so the harness fix from Phase 2 Day 4 doesn't have to be
 * rediscovered.
 *
 * Coverage (handoff requires ≥6 cases):
 *   1. Happy path renders the seeded suggestion.
 *   2. Empty state when API returns suggestion: null.
 *   3. Quota-exhausted state.
 *   4. Refresh button calls /refresh + updates the card.
 *   5. Dismiss button hides the card.
 *   6. Flag-off (fail-closed) — card does not render.
 *   7. Error state on a 500.
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
  })
}

async function blockConsentAndAnalyticsScripts(page) {
  await page.route(/app\.termly\.io|clarity\.ms/, (route) => route.abort())
}

function buildProfileUser(overrides = {}) {
  return {
    id: 9,
    username: 'beta_student1',
    role: 'student',
    accountType: 'student',
    email: 'beta_student1@studyhub.local',
    emailVerified: true,
    twoFaEnabled: false,
    avatarUrl: null,
    createdAt: '2026-01-15T08:00:00.000Z',
    enrollments: [
      {
        id: 905,
        courseId: 4921,
        course: {
          id: 4921,
          code: 'CMSC106',
          name: 'Introduction to C Programming',
          school: { id: 1, name: 'University of Maryland', short: 'UMD' },
        },
      },
    ],
    counts: { courses: 1, sheets: 0, stars: 0 },
    _count: { enrollments: 1, studySheets: 0 },
    ...overrides,
  }
}

async function mockProfileRoutes(page, profileUser) {
  await page.route(`**/api/users/${profileUser.username}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...profileUser,
        profileVisibility: 'public',
        followers: 0,
        following: 0,
        pinnedSheets: [],
        sharedShelves: [],
        badges: [],
        profileLinks: [],
      }),
    })
  })
  await page.route(`**/api/users/${profileUser.username}/activity*`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`**/api/users/${profileUser.username}/badges`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/users/me/follow-suggestions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/dashboard/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: profileUser,
        recentSheets: [],
        stats: { sheets: 0, stars: 0, courses: 1, streak: 0 },
        activeCourses: [],
      }),
    })
  })
  // Phase 2's UpcomingExamsCard sits above this one in the same column;
  // give it an empty-list response so the Overview tab still renders
  // without that card pulling focus.
  await page.route('**/api/exams/upcoming*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ exams: [] }),
    })
  })
}

// Force the design_v2_ai_card flag on. `flag` URL param matches the
// hook's evaluate endpoint; the catch-all in mockAuthenticatedApp
// returns {} for unknown routes, which under fail-closed = disabled,
// so we must opt in explicitly.
async function enableAiCardFlag(page) {
  await page.route('**/api/flags/evaluate/design_v2_ai_card', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: true, reason: 'ENABLED' }),
    })
  })
}

const SEEDED_SUGGESTION = {
  id: 7,
  text: "You haven't reviewed Organic Chemistry in 3 days. Quick refresher?",
  ctaLabel: 'Open in Hub AI',
  ctaAction: 'open_chat',
  generatedAt: '2026-04-28T10:00:00.000Z',
}

test.describe('AiSuggestionCard — view + write states', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
    await blockConsentAndAnalyticsScripts(page)
  })

  test('renders the seeded suggestion on the Overview tab (happy path)', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    await enableAiCardFlag(page)
    await page.route('**/api/ai/suggestions', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ suggestion: SEEDED_SUGGESTION, quotaExhausted: false }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByTestId('ai-suggestion-card')).toBeVisible()
    await expect(page.getByText(SEEDED_SUGGESTION.text)).toBeVisible()
    await expect(page.getByRole('button', { name: SEEDED_SUGGESTION.ctaLabel })).toBeVisible()
  })

  test('renders the empty state when the API returns suggestion: null', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    await enableAiCardFlag(page)
    await page.route('**/api/ai/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ suggestion: null, quotaExhausted: false }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByText(/no suggestions right now/i)).toBeVisible()
    await expect(page.getByText(/check back later/i)).toBeVisible()
  })

  test('renders the quota-exhausted state when the API reports it', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    await enableAiCardFlag(page)
    await page.route('**/api/ai/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ suggestion: null, quotaExhausted: true }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByTestId('ai-suggestion-quota')).toBeVisible()
  })

  test('renders the error state on a 500 from /api/ai/suggestions', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    await enableAiCardFlag(page)
    await page.route('**/api/ai/suggestions', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'boom' }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByText(/couldn[’']t load right now/i)).toBeVisible()
  })

  test('refresh updates the card with the new suggestion', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    await enableAiCardFlag(page)
    // Refresh handler must be registered FIRST so the more-specific
    // /api/ai/suggestions/refresh route wins LIFO over the parent
    // /api/ai/suggestions handler when the listing GET is fetched.
    let refreshCalled = false
    await page.route('**/api/ai/suggestions/refresh', async (route) => {
      refreshCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggestion: { ...SEEDED_SUGGESTION, id: 99, text: 'A brand-new suggestion arrived.' },
          quotaExhausted: false,
        }),
      })
    })
    await page.route('**/api/ai/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ suggestion: SEEDED_SUGGESTION, quotaExhausted: false }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByText(SEEDED_SUGGESTION.text)).toBeVisible()
    await page.getByTestId('ai-suggestion-refresh').click()
    await expect(page.getByText('A brand-new suggestion arrived.')).toBeVisible()
    expect(refreshCalled).toBe(true)
  })

  test('dismiss hides the card and POSTs to /:id/dismiss', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    await enableAiCardFlag(page)
    let dismissedPath = ''
    // Per-id dismiss MUST register first so the wildcard listing
    // route doesn't catch it. Same LIFO precedence pattern Phase 2
    // sorted out for upcoming-exams write flows.
    await page.route('**/api/ai/suggestions/*/dismiss', async (route) => {
      dismissedPath = new URL(route.request().url()).pathname
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.route('**/api/ai/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ suggestion: SEEDED_SUGGESTION, quotaExhausted: false }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByText(SEEDED_SUGGESTION.text)).toBeVisible()
    await page.getByTestId('ai-suggestion-dismiss').click()
    await expect(page.getByText(SEEDED_SUGGESTION.text)).toHaveCount(0)
    expect(dismissedPath).toBe(`/api/ai/suggestions/${SEEDED_SUGGESTION.id}/dismiss`)
  })

  test('renders nothing when the design_v2_ai_card flag is OFF (fail-closed)', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)
    // Explicit DISABLED instead of relying on the catch-all's empty
    // {} response — pin the regression so any future change to the
    // flag-evaluate response shape can't accidentally re-enable.
    await page.route('**/api/flags/evaluate/design_v2_ai_card', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, reason: 'DISABLED' }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    // Wait for the page to settle, then confirm the card is absent.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('ai-suggestion-card')).toHaveCount(0)
    await expect(page.getByTestId('ai-suggestion-skeleton')).toHaveCount(0)
  })
})
