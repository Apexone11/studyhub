/**
 * upcoming-exams.e2e.spec.js — Playwright coverage for the Phase 2
 * Upcoming Exams card on UserProfilePage Overview.
 *
 * Scope:
 *   - Card visibility: confirms the gate (flag × not-self-learner)
 *     is correctly reached and the card is mounted.
 *   - Empty / happy-path / error render paths — the three states the
 *     component actually supports today.
 *
 * Out of scope (skipped with explicit TODO blocks):
 *   - Add-exam modal flow: the "Add exam" CTA + <Modal> form is not
 *     yet built. Day 2/3 wired READ; write-side UI is a follow-up
 *     cycle. The handoff's E2E steps 4-10 target that UI. Un-skip
 *     once the modal + form lands.
 *   - Edit / delete hover-menu: same story — UI not yet built.
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

// Termly's consent banner + Microsoft Clarity both load from external
// CDNs on page boot (see `frontend/studyhub-app/index.html`). In a
// Playwright run the consent banner renders as a role="alertdialog"
// that covers the whole viewport and blocks every locator we try to
// click. Short-circuit both script loads so the banner never mounts.
async function blockConsentAndAnalyticsScripts(page) {
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
 * View-state tests are scaffolded but skipped pending a harness fix.
 *
 * Blocker (2026-04-24 Day 3): after aborting the Termly + Clarity
 * external scripts (which otherwise render a full-viewport consent
 * alertdialog that blocks every locator), the page still renders a
 * blank --sh-bg color with no React tree in the DOM. The existing
 * mockAuthenticatedApp catch-all + explicit /api/users/:u route
 * aren't enough to bootstrap UserProfilePage into a mounted state;
 * something earlier in the auth / session bootstrap is gated and
 * the component tree never hydrates. See error-context.md +
 * test-failed-1.png artifacts under test-results/ for a blank canvas.
 *
 * Path forward (Day 4 or part of a future E2E harness cycle):
 *   - Align with the pattern used by an existing profile-rendering
 *     E2E test (e.g. critical-flows.e2e.spec.js 'profile viewing
 *     flow') and copy its mock surface area verbatim.
 *   - Or switch to a hitting-the-real-backend E2E (beta config) that
 *     exercises the seeded beta_student1 exams end-to-end instead
 *     of mocking every route.
 *
 * Keeping the spec in-tree with the three view-state tests + the
 * write-side describe.skip block so the TODOs are visible in the
 * test report and nobody has to rediscover the blocker.
 */
test.describe.skip('UpcomingExamsCard — view states (harness blocker)', () => {
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
 * The write-side flows (Add / Edit / Delete) are gated on UI that
 * hasn't shipped yet — there is no "Add exam" CTA, no add/edit
 * <Modal> form, and no hover-menu in the card. The handoff's steps
 * 4-10 test that UI. Un-skip this block once the UI lands.
 *
 * Blockers tracked:
 *   - Add exam CTA + form modal (Course select, Title, Date,
 *     Preparedness slider, Notes textarea).
 *   - Edit affordance (right-click menu or hover-menu "Edit").
 *   - Delete affordance (right-click menu or hover-menu "Delete").
 *   - "Study now" button + "View plan" link (referenced in the
 *     handoff spec but not yet mocked up).
 */
test.describe.skip('UpcomingExamsCard — write flows (UI not yet built)', () => {
  test('add → view → edit → delete a single exam end-to-end', async () => {
    // TODO: wire once the Add / Edit / Delete UI lands.
  })
})
