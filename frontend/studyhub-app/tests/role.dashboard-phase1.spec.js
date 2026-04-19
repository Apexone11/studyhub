import { expect, test } from '@playwright/test'

/**
 * Phase 1 of the v2 design refresh — /dashboard role variants.
 *
 * Verifies that with `design_v2_phase1_dashboard` enabled, each accountType
 * sees:
 *   - the correct hero eyebrow (SESSION/TEACHING/LEARNING READY),
 *   - the role-aware welcome context line after "Joined …",
 *   - the Top Contributors widget rendered (with role-aware heading / empty copy).
 *
 * Also asserts no "Member" label ever appears for a Self-learner.
 *
 * See docs/internal/design-refresh-v2-master-plan.md Phase 1 and
 * docs/internal/design-refresh-v2-roles-integration.md.
 */

function buildSessionUser(accountType) {
  return {
    id: accountType === 'other' ? 801 : accountType === 'teacher' ? 802 : 800,
    username: `beta_${accountType}`,
    role: 'student',
    accountType,
    email: `${accountType}@example.com`,
    emailVerified: true,
    twoFaEnabled: false,
    avatarUrl: null,
    createdAt: '2026-03-16T12:00:00.000Z',
    enrollments: [],
    counts: { courses: 0, sheets: 0, stars: 0 },
    _count: { enrollments: 0, studySheets: 0 },
    csrfToken: 'csrf-token',
  }
}

async function mockDashboardAuth(page, accountType) {
  const user = buildSessionUser(accountType)

  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, json: user }))
  await page.route('**/api/notifications?*', (route) =>
    route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } }),
  )
  await page.route('**/api/hashtags/me', (route) =>
    route.fulfill({ status: 200, json: { hashtags: [] } }),
  )
  await page.route('**/api/users/me/learning-goal', (route) =>
    route.fulfill({ status: 200, json: { goal: null } }),
  )
  await page.route('**/api/sheets/leaderboard?type=*', (route) =>
    route.fulfill({ status: 200, json: [] }),
  )
  await page.route('**/api/feed?*', (route) =>
    route.fulfill({
      status: 200,
      json: { items: [], total: 0, partial: false, degradedSections: [] },
    }),
  )

  // Roles v2 flags all on (existing behavior).
  await page.route('**/api/flags/evaluate/flag_roles_v2**', (route) =>
    route.fulfill({ status: 200, json: { enabled: true } }),
  )
  // Phase 1 design-refresh flag ON for all assertions in this file.
  await page.route('**/api/flags/evaluate/design_v2_phase1_dashboard', (route) =>
    route.fulfill({ status: 200, json: { enabled: true } }),
  )
  // Every other design_v2 flag OFF so we isolate Phase 1 behavior.
  await page.route('**/api/flags/evaluate/design_v2_**', (route, request) => {
    if (request.url().includes('design_v2_phase1_dashboard')) {
      return route.fulfill({ status: 200, json: { enabled: true } })
    }
    return route.fulfill({ status: 200, json: { enabled: false } })
  })

  // Dashboard summary stub (topContributors intentionally empty until the
  // backend endpoint lands mid-Week 1).
  await page.route('**/api/dashboard/summary', (route) =>
    route.fulfill({
      status: 200,
      json: {
        hero: {
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          avatarUrl: null,
          email: user.email,
          emailVerified: true,
        },
        stats: { courseCount: 0, sheetCount: 0, starCount: 0 },
        courses: [],
        recentSheets: [],
        activation: {
          isNewUser: true,
          completedCount: 0,
          totalCount: 3,
          checklist: [],
          nextStep: null,
        },
        topContributors: [],
      },
    }),
  )
}

async function skipTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test('Student dashboard: SESSION READY eyebrow + student welcome context + Top Contributors widget @smoke', async ({
  page,
}) => {
  await mockDashboardAuth(page, 'student')
  await skipTutorials(page)
  await page.goto('/dashboard')

  await expect(page.getByText('SESSION READY')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Welcome back, beta_student/ })).toBeVisible()
  await expect(
    page.getByText(/courses, notes, and practice tests are ready when you are/i),
  ).toBeVisible()

  // Top Contributors widget: role-aware heading + classmates empty copy.
  await expect(page.getByRole('heading', { name: /courses/i, level: 3 })).toBeVisible()
  await expect(page.getByText(/No activity from classmates yet/i)).toBeVisible()
})

test('Teacher dashboard: TEACHING READY eyebrow + teacher welcome context', async ({ page }) => {
  await mockDashboardAuth(page, 'teacher')
  await skipTutorials(page)
  await page.goto('/dashboard')

  await expect(page.getByText('TEACHING READY')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Welcome back, beta_teacher/ })).toBeVisible()
  await expect(
    page.getByText(/courses, announcements, and materials are ready when you are/i),
  ).toBeVisible()

  // Teacher-flavored Top Contributors empty state.
  await expect(page.getByText(/No contributions yet from students in your courses/i)).toBeVisible()
})

test('Self-learner dashboard: LEARNING READY eyebrow, community copy, never "Member" @smoke', async ({
  page,
}) => {
  await mockDashboardAuth(page, 'other')
  await skipTutorials(page)
  await page.goto('/dashboard')

  await expect(page.getByText('LEARNING READY')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Welcome back, beta_other/ })).toBeVisible()
  await expect(
    page.getByText(/interests, notes, and learning goals are ready when you are/i),
  ).toBeVisible()

  // Self-learner-flavored Top Contributors widget: follow-centric, no
  // classmate language.
  await expect(page.getByRole('heading', { name: /follow/i, level: 3 })).toBeVisible()
  await expect(page.getByText(/Follow a few people/i)).toBeVisible()

  // Label-scan sweep: Self-learner page must never contain "Member" as a
  // role label.
  const bodyText = await page.evaluate(() => document.body.innerText || '')
  expect(bodyText).not.toMatch(/\bMember\b/)
  // Should also never contain "classmates" anywhere in the dashboard chrome
  // for a Self-learner (feed/composer surfaces are out of scope).
  expect(bodyText).not.toMatch(/classmates/i)
})
