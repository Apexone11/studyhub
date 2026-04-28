/**
 * upcoming-exams.e2e.spec.js — Playwright coverage for the Phase 2
 * Upcoming Exams card on UserProfilePage Overview.
 *
 * Scope (Day 4):
 *   - View states: empty / happy-path (with preparedness bar) / error.
 *   - Write flows: add (empty-state CTA → modal → POST → row appears),
 *     edit (per-row Edit → modal → PATCH → row updates), delete
 *     (per-row Delete → confirm → DELETE → row removed).
 *
 * Gating: relies on the `design_v2_upcoming_exams` flag being
 * fail-open in the hook (which it is as of 2026-04-24). The
 * mockAuthenticatedApp catch-all returns {} for the flag evaluate
 * endpoint, which the client treats as fail-open → enabled.
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

// Task #70 replaced the Termly resource-blocker with a self-hosted
// React banner (CookieConsentBanner.jsx, gated on
// localStorage["studyhub.cookieConsent"]). For Playwright we:
//   1. Pre-seed the consent key BEFORE any page navigation so the
//      banner short-circuits on mount and never blocks our locators.
//   2. Keep aborting *.termly.io + clarity.ms requests as defense in
//      depth — Termly is still loaded for the legal-document embed
//      (Terms / Privacy / Cookie Policy / etc.) and Clarity must
//      never fire in tests regardless.
async function blockConsentAndAnalyticsScripts(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'studyhub.cookieConsent',
        JSON.stringify({ choice: 'essential', timestamp: new Date().toISOString() }),
      )
    } catch {
      /* ignore — Playwright contexts always allow localStorage */
    }
  })
  await page.route(/app\.termly\.io|clarity\.ms/, (route) => route.abort())
}

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
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
  // Profile detail endpoint the UserProfilePage pulls on mount.
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
  // Activity grid + badges list: components expect arrays.
  await page.route(`**/api/users/${profileUser.username}/activity*`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`**/api/users/${profileUser.username}/badges`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  // FollowSuggestions crashes on `{}` because it calls .slice() directly;
  // the catch-all returns {} which is truthy but not an array. Explicit [].
  await page.route('**/api/users/me/follow-suggestions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  // Dashboard-summary endpoint the Overview tab pulls.
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
}

/*
 * View-state coverage: empty, happy-path list with preparedness bar,
 * and error-state soft-fail. The harness bootstrap was unblocked on
 * Day 4 by mocking /api/users/me/follow-suggestions (and friends) to
 * return [] so the own-profile sidebar widgets don't crash during
 * render. See mockProfileRoutes().
 */
test.describe('UpcomingExamsCard — view states', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
    await blockConsentAndAnalyticsScripts(page)
  })

  test('renders the empty state when the user has no exams', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)

    await page.route('**/api/exams/upcoming*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exams: [] }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)

    // The heading is inside the card and is the stable anchor we can
    // query for regardless of which render branch we're in.
    await expect(page.getByRole('heading', { name: /upcoming exams/i })).toBeVisible()
    await expect(page.getByText(/no exams coming up/i)).toBeVisible()
  })

  test('renders the happy-path list with preparedness bar at the correct percent', async ({
    page,
  }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)

    await page.route('**/api/exams/upcoming*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exams: [
            {
              id: 1,
              title: 'CMSC106 Midterm',
              location: 'ITE 231',
              examDate: isoDaysFromNow(11),
              visibility: 'private',
              notes: null,
              preparednessPercent: 62,
              course: { id: 4921, code: 'CMSC106', name: 'Intro to C Programming' },
            },
            {
              id: 2,
              title: 'CMSC131 Final',
              location: 'Engineering 027',
              examDate: isoDaysFromNow(45),
              visibility: 'private',
              notes: null,
              preparednessPercent: 20,
              course: { id: 4922, code: 'CMSC131', name: 'OOP I' },
            },
          ],
        }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)

    await expect(page.getByRole('heading', { name: /upcoming exams/i })).toBeVisible()
    await expect(page.getByText('CMSC106 Midterm')).toBeVisible()
    await expect(page.getByText('CMSC131 Final')).toBeVisible()

    // Preparedness bars expose progressbar role + aria-valuenow.
    const firstBar = page.getByTestId('exam-preparedness-1')
    await expect(firstBar).toHaveAttribute('role', 'progressbar')
    await expect(firstBar).toHaveAttribute('aria-valuenow', '62')

    const secondBar = page.getByTestId('exam-preparedness-2')
    await expect(secondBar).toHaveAttribute('aria-valuenow', '20')

    // Text labels beneath each bar.
    await expect(page.getByText(/62% prepared/i)).toBeVisible()
    await expect(page.getByText(/20% prepared/i)).toBeVisible()
  })

  test('renders the error state when /api/exams/upcoming 500s', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)

    await page.route('**/api/exams/upcoming*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'boom' }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)

    await expect(page.getByRole('heading', { name: /upcoming exams/i })).toBeVisible()
    await expect(page.getByText(/could not load your exams/i)).toBeVisible()
  })
})

/*
 * Phase 2 Day 4 write-flow coverage. The card exposes:
 *   - Empty state "Add exam" CTA (primary button) and header "Add exam"
 *     ghost button once at least one exam exists.
 *   - Per-row Edit + Delete ghost buttons with aria-label={`Edit ${title}`}
 *     / `Delete ${title}` so keyboard users can address the right row.
 *   - <ExamFormModal> shared between Add and Edit (POST vs PATCH).
 *   - <DeleteExamConfirm> confirmation modal hitting DELETE.
 *
 * One end-to-end test walks the full CRUD loop: add → view → edit →
 * delete. Optimistic updates in the card keep the list in-sync without
 * a re-fetch, so we don't need to re-mock /api/exams/upcoming after
 * each mutation.
 */
test.describe('UpcomingExamsCard — write flows', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
    await blockConsentAndAnalyticsScripts(page)
  })

  test('add exam: empty state CTA opens modal, POST, row appears', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)

    await page.route('**/api/exams/upcoming*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exams: [] }),
      })
    })

    let postBody = null
    await page.route('**/api/exams', async (route) => {
      if (route.request().method() === 'POST') {
        postBody = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            exam: {
              id: 501,
              title: postBody.title,
              examDate: postBody.examDate,
              preparednessPercent: postBody.preparednessPercent ?? 0,
              course: user.enrollments[0].course,
              courseCode: user.enrollments[0].course.code,
            },
          }),
        })
        return
      }
      await route.fulfill({ status: 200, json: {} })
    })

    await page.goto(`/users/${user.username}?tab=overview`)

    // Empty state is reached → Add exam primary CTA is visible.
    await expect(page.getByText(/no exams coming up/i)).toBeVisible()
    const card = page.getByLabel(/upcoming exams/i)
    await card.getByRole('button', { name: /^add exam$/i }).click()

    // Add-exam modal opens.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /add upcoming exam/i })).toBeVisible()

    // Fill required fields + submit.
    await dialog.getByLabel(/title/i).fill('New Calc Midterm')
    await dialog.getByLabel(/^date/i).fill('2026-12-01')
    await dialog.getByRole('button', { name: /^add exam$/i }).click()

    // Row shows up via the optimistic insert path.
    await expect(page.getByText('New Calc Midterm')).toBeVisible()
    expect(postBody).toMatchObject({
      title: 'New Calc Midterm',
      courseId: user.enrollments[0].course.id,
    })
  })

  test('edit exam: per-row Edit opens modal, PATCH, row reflects new title', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)

    // Register the PATCH handler FIRST so the /upcoming* route (which
    // is a more specific glob of the same prefix) gets Playwright's
    // LIFO priority and wins for the listing fetch.
    let patchBody = null
    let patchPath = ''
    await page.route('**/api/exams/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = route.request().postDataJSON()
        patchPath = new URL(route.request().url()).pathname
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            exam: {
              id: 77,
              title: patchBody.title,
              examDate: patchBody.examDate,
              preparednessPercent: patchBody.preparednessPercent ?? 40,
              course: user.enrollments[0].course,
              courseCode: user.enrollments[0].course.code,
            },
          }),
        })
        return
      }
      await route.fulfill({ status: 200, json: {} })
    })

    await page.route('**/api/exams/upcoming*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exams: [
            {
              id: 77,
              title: 'CMSC106 Midterm',
              location: 'ITE 231',
              examDate: isoDaysFromNow(14),
              preparednessPercent: 40,
              course: user.enrollments[0].course,
              courseCode: user.enrollments[0].course.code,
            },
          ],
        }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByText('CMSC106 Midterm')).toBeVisible()

    await page.getByRole('button', { name: /edit cmsc106 midterm/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /edit exam/i })).toBeVisible()

    await dialog.getByLabel(/title/i).fill('CMSC106 Final')
    await dialog.getByRole('button', { name: /save changes/i }).click()

    await expect(page.getByText('CMSC106 Final')).toBeVisible()
    expect(patchPath).toBe('/api/exams/77')
    expect(patchBody).toMatchObject({ title: 'CMSC106 Final' })
    expect(patchBody).not.toHaveProperty('courseId')
  })

  test('delete exam: per-row Delete opens confirm, DELETE, row removed', async ({ page }) => {
    const user = createSessionUser(buildProfileUser())
    await mockAuthenticatedApp(page, { user })
    await mockProfileRoutes(page, user)

    // Register the DELETE handler FIRST so /upcoming* (more specific
    // glob on the same prefix) wins Playwright's LIFO route priority.
    let deletedPath = ''
    await page.route('**/api/exams/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedPath = new URL(route.request().url()).pathname
        await route.fulfill({ status: 204, body: '' })
        return
      }
      await route.fulfill({ status: 200, json: {} })
    })

    await page.route('**/api/exams/upcoming*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exams: [
            {
              id: 88,
              title: 'Physics Midterm',
              location: null,
              examDate: isoDaysFromNow(7),
              preparednessPercent: 25,
              course: user.enrollments[0].course,
              courseCode: user.enrollments[0].course.code,
            },
          ],
        }),
      })
    })

    await page.goto(`/users/${user.username}?tab=overview`)
    await expect(page.getByText('Physics Midterm')).toBeVisible()

    await page.getByRole('button', { name: /delete physics midterm/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /delete this exam\?/i })).toBeVisible()
    await dialog.getByRole('button', { name: /^delete exam$/i }).click()

    await expect(page.getByText('Physics Midterm')).toHaveCount(0)
    expect(deletedPath).toBe('/api/exams/88')
  })
})
